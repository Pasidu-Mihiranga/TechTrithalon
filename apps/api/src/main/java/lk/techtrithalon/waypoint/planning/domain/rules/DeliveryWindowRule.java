package lk.techtrithalon.waypoint.planning.domain.rules;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ArrivalCalculator;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;
import lk.techtrithalon.waypoint.planning.domain.TripTimeCalculator;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * R8: Every stop on a trip must arrive at or before the outlet's effective window close time.
 */
public class DeliveryWindowRule implements ConstraintRule {

    public static final String CODE = "DELIVERY_WINDOW";

    private final ArrivalCalculator arrivalCalculator = new ArrivalCalculator();
    private final TripTimeCalculator tripTimeCalculator = new TripTimeCalculator();

    @Override
    public String code() {
        return CODE;
    }

    @Override
    public Severity severity() {
        return Severity.HARD;
    }

    @Override
    public Scope scope() {
        return Scope.TRIP;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.trips() == null) {
            return List.of();
        }

        // Group trips by vehicle to handle departure cascading for multi-trip vehicle days
        Map<String, List<PlanTrip>> tripsByVehicle = new HashMap<>();
        for (PlanTrip trip : ctx.trips()) {
            String vehicleId = trip.vehicleId() != null ? trip.vehicleId() : "UNASSIGNED_" + trip.id();
            tripsByVehicle.computeIfAbsent(vehicleId, k -> new ArrayList<>()).add(trip);
        }

        List<ConstraintViolation> violations = new ArrayList<>();

        for (List<PlanTrip> vehicleTrips : tripsByVehicle.values()) {
            vehicleTrips.sort(Comparator.comparingInt(PlanTrip::tripIndex));

            LocalTime nextAvailableDeparture = null;

            for (PlanTrip trip : vehicleTrips) {
                DistrictTravel travel = ctx.travelByDistrict() != null ? ctx.travelByDistrict().get(trip.district()) : null;
                if (travel == null && ctx.travelByDistrict() != null && trip.district() != null) {
                    for (Map.Entry<String, DistrictTravel> entry : ctx.travelByDistrict().entrySet()) {
                        if (entry.getKey().equalsIgnoreCase(trip.district())) {
                            travel = entry.getValue();
                            break;
                        }
                    }
                }

                LocalTime nominalDeparture = arrivalCalculator.resolveTripDepartureTime(trip.brand(), trip.tripIndex(), ctx.constraintParams());
                LocalTime tripDepart = nominalDeparture;
                if (nextAvailableDeparture != null && nextAvailableDeparture.isAfter(tripDepart)) {
                    tripDepart = nextAvailableDeparture;
                }

                List<ArrivalCalculator.ScheduledStop> scheduledStops = arrivalCalculator.schedule(
                    trip,
                    travel,
                    ctx.serviceByBrandDock(),
                    tripDepart
                );

                for (ArrivalCalculator.ScheduledStop scheduledStop : scheduledStops) {
                    if (scheduledStop.isLate()) {
                        PlanOrder order = scheduledStop.stop().order();
                        String orderRef = order != null ? order.orderRef() : String.valueOf(scheduledStop.stop().orderId());
                        LocalTime windowClose = order != null ? order.effectiveWindowClose() : null;

                        violations.add(new ConstraintViolation(
                            CODE,
                            Severity.HARD,
                            Scope.TRIP,
                            EntityType.ORDER,
                            orderRef,
                            "Order " + orderRef + " planned arrival " + scheduledStop.plannedArrival()
                                + " is after effective window close " + windowClose + ".",
                            scheduledStop.plannedArrival().toString(),
                            windowClose != null ? windowClose.toString() : "N/A",
                            "WINDOW_LATE",
                            Map.of(
                                "tripId", trip.id(),
                                "orderRef", orderRef,
                                "plannedArrival", scheduledStop.plannedArrival().toString(),
                                "effectiveWindowClose", windowClose != null ? windowClose.toString() : "N/A",
                                "waitMinutes", scheduledStop.waitMinutes()
                            )
                        ));
                    }
                }

                int tripMinutes = (trip.tripMinutes() != null && trip.tripMinutes() > 0)
                    ? trip.tripMinutes()
                    : tripTimeCalculator.compute(trip, travel, ctx.serviceByBrandDock());

                // Waiting is elapsed schedule time, separate from the prescribed trip-time budget.
                long waitMinutes = scheduledStops.stream().mapToLong(ArrivalCalculator.ScheduledStop::waitMinutes).sum();
                nextAvailableDeparture = tripDepart.plusMinutes(tripMinutes + waitMinutes);
            }
        }

        return violations;
    }
}
