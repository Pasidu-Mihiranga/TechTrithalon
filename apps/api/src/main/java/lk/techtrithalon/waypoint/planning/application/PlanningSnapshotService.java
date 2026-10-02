package lk.techtrithalon.waypoint.planning.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.fleetops.domain.FleetVehicle;
import lk.techtrithalon.waypoint.fleetops.domain.FuelBalance;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanningSnapshot;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class PlanningSnapshotService {
    private final PlanningSnapshotRepository snapshots;
    private final OrderQueryService orders;
    private final FleetService fleet;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final Clock clock;
    private final ObjectMapper canonical;

    public PlanningSnapshotService(
        PlanningSnapshotRepository snapshots,
        OrderQueryService orders,
        FleetService fleet,
        ReferenceService reference,
        ReferenceProperties referenceProperties,
        Clock clock,
        ObjectMapper mapper
    ) {
        this.snapshots = snapshots;
        this.orders = orders;
        this.fleet = fleet;
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.clock = clock;
        this.canonical = mapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    @Transactional
    public PlanningSnapshot create(CurrentUser user, LocalDate planDate, String depot, List<Long> orderIds) {
        LocalDate day = planDate == null ? referenceProperties.demoOperatingDate() : planDate;
        String resolvedDepot = resolveDepot(user, depot);
        CalendarDay calendarDay = reference.day(day);
        if (!calendarDay.operating()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "OPERATING_DAY",
                "Planning snapshots require an operating day");
        }

        List<CustomerOrder> selected = selectOrders(user, day, resolvedDepot, orderIds);
        List<Long> sortedIds = selected.stream().map(CustomerOrder::id).sorted().toList();

        List<Map<String, Object>> fleetPayload = freezeFleet(user, day, resolvedDepot);
        Map<String, Object> constraints = freezeConstraints(calendarDay);
        String referenceVersion = "demo-" + referenceProperties.demoOperatingDate();
        String fleetJson = writeJson(fleetPayload);
        String constraintsJson = writeJson(constraints);
        String contentHash = hash(day, resolvedDepot, sortedIds, fleetJson, constraintsJson, referenceVersion);
        Instant takenAt = clock.instant();

        return snapshots.insert(
            day, resolvedDepot, takenAt, sortedIds, fleetJson, constraintsJson,
            referenceVersion, contentHash, user.id()
        );
    }

    public PlanningSnapshot get(CurrentUser user, long id) {
        PlanningSnapshot snapshot = snapshots.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"));
        if (!user.canAccessDepot(snapshot.depot())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        return snapshot;
    }

    public PlanningSnapshot latest(CurrentUser user, LocalDate planDate, String depot) {
        LocalDate day = planDate == null ? referenceProperties.demoOperatingDate() : planDate;
        String resolvedDepot = resolveDepot(user, depot);
        reference.day(day);
        return snapshots.findLatest(day, resolvedDepot)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"));
    }

    /** Recompute current input hash for the same date/depot/order set to detect drift. */
    public Map<String, Object> compare(CurrentUser user, long id) {
        PlanningSnapshot snapshot = get(user, id);
        List<CustomerOrder> currentOrders = orders.confirmedForPlanning(user, snapshot.planDate(), snapshot.depot());
        List<Long> currentIds = currentOrders.stream().map(CustomerOrder::id).sorted().toList();
        List<Map<String, Object>> fleetPayload = freezeFleet(user, snapshot.planDate(), snapshot.depot());
        Map<String, Object> constraints = freezeConstraints(reference.day(snapshot.planDate()));
        String fleetJson = writeJson(fleetPayload);
        String constraintsJson = writeJson(constraints);
        String currentHash = hash(
            snapshot.planDate(), snapshot.depot(), currentIds, fleetJson, constraintsJson, snapshot.referenceVersion()
        );
        boolean unchanged = currentHash.equals(snapshot.contentHash());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("snapshotId", snapshot.id());
        result.put("snapshotHash", snapshot.contentHash());
        result.put("currentHash", currentHash);
        result.put("unchanged", unchanged);
        result.put("snapshotOrderCount", snapshot.orderIds().size());
        result.put("currentOrderCount", currentIds.size());
        return result;
    }

    private List<CustomerOrder> selectOrders(
        CurrentUser user, LocalDate day, String depot, List<Long> orderIds
    ) {
        if (orderIds == null || orderIds.isEmpty()) {
            return orders.confirmedForPlanning(user, day, depot);
        }
        List<Long> distinct = orderIds.stream().filter(Objects::nonNull).distinct().toList();
        List<CustomerOrder> found = orders.ordersByIds(user, distinct);
        if (found.size() != distinct.size()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                "One or more selected orders were not found for this depot");
        }
        for (CustomerOrder order : found) {
            if (!"confirmed".equals(order.status())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                    "Only confirmed orders may enter a planning snapshot");
            }
            if (!day.equals(order.orderDate()) || !depot.equals(order.depot())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                    "Selected orders must match the plan date and depot");
            }
        }
        return found.stream().sorted((a, b) -> Long.compare(a.id(), b.id())).toList();
    }

    private List<Map<String, Object>> freezeFleet(CurrentUser user, LocalDate day, String depot) {
        List<FleetVehicle> vehicles = fleet.fleet(user, day).stream()
            .filter(v -> depot.equals(v.depot()))
            .sorted((a, b) -> a.vehicleId().compareTo(b.vehicleId()))
            .toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (FleetVehicle v : vehicles) {
            FuelBalance fuel = fleet.fuel(user, v.vehicleId(), day);
            Map<String, Object> row = new TreeMap<>();
            row.put("vehicleId", v.vehicleId());
            row.put("type", v.type());
            row.put("temp", v.temp());
            row.put("weightCapKg", v.weightCapKg());
            row.put("volumeCapM3", v.volumeCapM3());
            row.put("depot", v.depot());
            row.put("availabilityStatus", v.availabilityStatus());
            row.put("availabilityRecorded", v.availabilityRecorded());
            row.put("weeklyFuelQuotaL", fuel.quotaLitres());
            row.put("fuelRemainingL", fuel.remainingLitres());
            row.put("fuelRecorded", fuel.recorded());
            rows.add(row);
        }
        return rows;
    }

    private Map<String, Object> freezeConstraints(CalendarDay day) {
        Map<String, Object> constraints = new TreeMap<>();
        constraints.put("operating", day.operating());
        constraints.put("isoYear", day.isoYear());
        constraints.put("isoWeek", day.isoWeek());
        constraints.put("cutoffLocalTime", "16:00:00");
        constraints.put("timeZone", "Asia/Colombo");
        constraints.put("ruleVersion", "phase-5");
        return constraints;
    }

    private String resolveDepot(CurrentUser user, String depot) {
        if (user.depot() != null && !user.depot().isBlank()) {
            if (depot != null && !depot.isBlank() && !user.depot().equals(depot)) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            }
            return user.depot();
        }
        if (depot == null || depot.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED",
                "Provide a depot when the dispatcher is not scoped to one");
        }
        if (!user.canAccessDepot(depot)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        return depot;
    }

    private String writeJson(Object value) {
        try {
            return canonical.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialise snapshot payload", e);
        }
    }

    private String hash(
        LocalDate day, String depot, List<Long> orderIds,
        String fleetJson, String constraintsJson, String referenceVersion
    ) {
        try {
            String payload = day + "|" + depot + "|" + orderIds + "|" + fleetJson + "|"
                + constraintsJson + "|" + referenceVersion;
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to hash snapshot", e);
        }
    }
}
