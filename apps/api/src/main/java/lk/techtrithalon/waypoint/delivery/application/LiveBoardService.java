package lk.techtrithalon.waypoint.delivery.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryRecord;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryTrip;
import lk.techtrithalon.waypoint.delivery.domain.LiveViews;
import lk.techtrithalon.waypoint.delivery.domain.StopVisit;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.planning.application.PublishedRouteService;
import lk.techtrithalon.waypoint.planning.domain.PublishedRoute;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dispatcher's view of a run in motion: each published trip with its state, current stop,
 * progress and last activity. Everything is read from the loader's tasks and the driver's records,
 * so the board moves as soon as a driver acts (the page polls).
 */
@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class LiveBoardService {
    private final DeliveryRepository deliveries;
    private final LoadTaskService loadTasks;
    private final PublishedRouteService routes;
    private final EtaProjector etas;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final Clock clock;

    public LiveBoardService(DeliveryRepository deliveries, LoadTaskService loadTasks, PublishedRouteService routes, EtaProjector etas,
                            ReferenceService reference, ReferenceProperties referenceProperties, Clock clock) {
        this.deliveries = deliveries; this.loadTasks = loadTasks; this.routes = routes; this.etas = etas;
        this.reference = reference; this.referenceProperties = referenceProperties; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public LiveViews.Board board(CurrentUser user, LocalDate date, String depot) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        String selected = depot == null || depot.isBlank() ? user.depot() : depot;
        if (selected == null) throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED", "Choose a depot");
        if (!user.canAccessDepot(selected)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        Instant now = clock.instant();
        var vehicles = loadTasks.currentForRun(user, day, selected).stream()
            .sorted(Comparator.comparing(LoadTask::vehicleId).thenComparingInt(LoadTask::tripIndex))
            .map(task -> vehicle(task, now)).toList();
        return new LiveViews.Board(day, selected, now, counts(vehicles), vehicles);
    }

    /** Trip counts for the dashboard: one depot, or every depot the dispatcher may see when none is given. */
    @Transactional(readOnly = true)
    public LiveViews.Counts counts(CurrentUser user, LocalDate date, String depot) {
        if (depot != null && !depot.isBlank()) return board(user, date, depot).counts();
        var total = LiveViews.Counts.NONE;
        for (String d : reference.depots(user)) total = total.plus(board(user, date, d).counts());
        return total;
    }

    private LiveViews.Vehicle vehicle(LoadTask task, Instant now) {
        var trip = deliveries.trip(task.planDate(), task.vehicleId(), task.tripIndex(), false);
        List<StopVisit> visits = trip.map(t -> deliveries.visits(t.id())).orElse(List.of());
        List<DeliveryRecord> records = trip.map(t -> deliveries.records(t.id())).orElse(List.of());
        var route = routes.current(task.planDate(), task.depot(), task.vehicleId(), task.tripIndex());
        Map<Long, LocalTime> eta = route.map(r -> etas.project(r, trip, visits)).orElse(Map.of());
        Map<Long, PublishedRoute.Stop> planned = new java.util.HashMap<>();
        route.ifPresent(r -> r.stops().forEach(s -> planned.put(s.orderId(), s)));

        var groups = groups(task);
        List<LiveViews.StopMark> marks = new ArrayList<>();
        int done = 0;
        Integer currentSeq = null;
        String currentOutlet = null, currentState = null;
        LocalTime currentEta = null;
        boolean delayed = false;
        boolean finished = trip.map(t -> "completed".equals(t.status())).orElse(false);
        for (int i = 0; i < groups.size(); i++) {
            var g = groups.get(i);
            var visit = visits.stream().filter(v -> v.outletId().equals(g.outletId())).findFirst();
            String status = visit.isEmpty() ? "PENDING" : visit.get().departedAt() == null ? "ARRIVED" : "COMPLETED";
            var first = planned.get(g.lines().getFirst().orderId());
            LocalTime projected = visit.isEmpty() ? eta.get(g.lines().getFirst().orderId()) : null;
            boolean late = projected != null && first != null && first.windowClose() != null && projected.isAfter(first.windowClose());
            delayed |= late;
            if ("COMPLETED".equals(status)) done++;
            else if (currentSeq == null && !finished && trip.isPresent()) {
                currentSeq = i + 1; currentOutlet = g.outletId(); currentState = "ARRIVED".equals(status) ? "ARRIVED" : "EN_ROUTE";
                currentEta = projected;
            }
            marks.add(new LiveViews.StopMark(i + 1, g.outletId(), status, late));
        }
        String state = finished ? "COMPLETED" : trip.isPresent() ? (delayed ? "DELAYED" : "IN_TRANSIT")
            : "loaded".equals(task.status()) ? "READY" : "LOADING";
        int issues = (int) records.stream().filter(r -> !"DELIVERED".equals(r.outcome())).count();
        Instant last = Stream.of(
                Stream.of(task.createdAt(), task.updatedAt(), task.startedAt(), task.loadedAt()),
                trip.stream().flatMap(t -> Stream.of(t.startedAt(), t.completedAt())),
                visits.stream().flatMap(v -> Stream.of(v.arrivedAt(), v.departedAt())),
                records.stream().map(DeliveryRecord::recordedAt))
            .flatMap(s -> s).filter(java.util.Objects::nonNull).max(Instant::compareTo).orElse(task.createdAt());
        long minutes = Math.max(0, Duration.between(last, now).toMinutes());
        return new LiveViews.Vehicle(task.vehicleId(), task.tripIndex(), task.brand(), task.district(), task.driverName(), state,
            task.planVersion(), task.plannedDepart(), trip.map(DeliveryTrip::startedAt).orElse(null), trip.map(DeliveryTrip::completedAt).orElse(null),
            groups.size(), done, currentSeq, currentOutlet, currentState, currentEta, task.lines().size(), records.size(), issues,
            last, minutes, marks);
    }

    private static LiveViews.Counts counts(List<LiveViews.Vehicle> vehicles) {
        int[] c = new int[5];
        for (var v : vehicles) c[switch (v.state()) { case "LOADING" -> 0; case "READY" -> 1; case "IN_TRANSIT" -> 2; case "DELAYED" -> 3; default -> 4; }]++;
        return new LiveViews.Counts(vehicles.size(), c[0], c[1], c[2], c[3], c[4]);
    }

    /** Stops as the driver sees them: consecutive orders for one outlet. */
    private record Group(String outletId, List<LoadLine> lines) {}

    private static List<Group> groups(LoadTask task) {
        var lines = task.lines().stream().sorted(Comparator.comparingInt(LoadLine::stopSeq)).toList();
        List<Group> groups = new ArrayList<>();
        List<LoadLine> current = new ArrayList<>();
        for (var line : lines) {
            if (!current.isEmpty() && !current.getLast().outletId().equals(line.outletId())) {
                groups.add(new Group(current.getFirst().outletId(), List.copyOf(current)));
                current = new ArrayList<>();
            }
            current.add(line);
        }
        if (!current.isEmpty()) groups.add(new Group(current.getFirst().outletId(), List.copyOf(current)));
        return groups;
    }
}
