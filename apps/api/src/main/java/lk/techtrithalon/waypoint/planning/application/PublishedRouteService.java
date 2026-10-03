package lk.techtrithalon.waypoint.planning.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.domain.ArrivalCalculator;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PublishedRoute;
import lk.techtrithalon.waypoint.planning.domain.PublishedTrip;
import lk.techtrithalon.waypoint.planning.domain.TripTimeCalculator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Published planning boundary for the road. Callers authorize their actor (the delivery module checks
 * that the trip belongs to the signed-in driver) before asking; this service only reads the current
 * published version and owns the arrival formula, so projected times match the plan's own.
 */
@Service
public class PublishedRouteService {
    private final ManualPlanRepository plans;
    private final PlanningSnapshotRepository snapshots;
    private final SnapshotPlanContextFactory contexts;
    private final ArrivalCalculator arrivals = new ArrivalCalculator();
    private final TripTimeCalculator time = new TripTimeCalculator();

    public PublishedRouteService(ManualPlanRepository plans, PlanningSnapshotRepository snapshots, SnapshotPlanContextFactory contexts) {
        this.plans = plans; this.snapshots = snapshots; this.contexts = contexts;
    }

    /** The vehicle's trip in the run's current published version, if it has one. */
    @Transactional(readOnly = true)
    public Optional<PublishedRoute> current(LocalDate date, String depot, String vehicleId, int tripIndex) {
        var planId = plans.currentPublished(date, depot);
        if (planId.isEmpty()) return Optional.empty();
        var plan = plans.find(planId.get(), false).orElseThrow();
        var trip = plans.publishedTrips(plan.id()).stream()
            .filter(t -> t.vehicleId().equals(vehicleId) && t.tripIndex() == tripIndex).findFirst();
        if (trip.isEmpty()) return Optional.empty();
        var snapshot = snapshots.findById(plan.snapshotId()).orElseThrow();
        var context = contexts.create(snapshot, plan.trips());
        Map<Long, PlanOrder> orders = new HashMap<>();
        context.orders().forEach(o -> orders.put(o.id(), o));
        PublishedTrip t = trip.get();
        var travel = context.travelByDistrict().get(t.district());
        List<PublishedRoute.Stop> stops = t.stops().stream().map(s -> {
            var order = orders.get(s.orderId());
            return new PublishedRoute.Stop(s.orderId(), s.seq(), order.outletId(), order.dockType(), order.parkingConstraint(),
                order.effectiveWindowOpen(), order.effectiveWindowClose(), s.plannedArrival(), s.serviceStart(),
                time.getServiceAllowanceMinutes(context.serviceByBrandDock(), order.brand(), order.dockType()));
        }).toList();
        return Optional.of(new PublishedRoute(plan.id(), plan.version(), t.tripId(), plan.planDate(), plan.depot(), t.vehicleId(),
            t.tripIndex(), t.brand(), t.district(), t.plannedDepart(), t.tripMinutes(), t.distanceKm(), t.driverUserId(), t.driverName(),
            travel == null ? 0 : travel.depotToDistrictMinutes(), travel == null ? 0 : travel.interStopMinutes(), stops));
    }

    /**
     * Projected arrival at each remaining stop (in route order), given when the vehicle was free:
     * the trip start when no stop is served yet ({@code fromDepot}), else the last departure.
     */
    public List<LocalTime> projectArrivals(PublishedRoute route, List<PublishedRoute.Stop> remaining, LocalTime readyAt, boolean fromDepot) {
        var stops = remaining.stream().map(s -> new ArrivalCalculator.RemainingStop(s.windowOpen(), s.serviceMinutes())).toList();
        return arrivals.project(stops, readyAt, fromDepot ? route.depotToDistrictMinutes() : route.interStopMinutes(), route.interStopMinutes());
    }
}
