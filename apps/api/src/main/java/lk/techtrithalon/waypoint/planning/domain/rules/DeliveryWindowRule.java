package lk.techtrithalon.waypoint.planning.domain.rules;

import java.time.LocalTime;
import java.util.ArrayList;
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
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * R8: Every stop on a trip must arrive at or before the outlet's effective window close time.
 */
public class DeliveryWindowRule implements ConstraintRule {

    public static final String CODE = "DELIVERY_WINDOW";

    private final ArrivalCalculator arrivalCalculator = new ArrivalCalculator();

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
            List<ArrivalCalculator.TripSchedule> day = arrivalCalculator.scheduleVehicleDay(
                vehicleTrips, district -> travelFor(ctx, district), ctx.serviceByBrandDock(), ctx.constraintParams());
            for (ArrivalCalculator.TripSchedule tripSchedule : day) {
                PlanTrip trip = tripSchedule.trip();
                for (ArrivalCalculator.ScheduledStop scheduledStop : tripSchedule.stops()) {
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
            }
        }

        return violations;
    }

    private static DistrictTravel travelFor(PlanContext ctx, String district) {
        if (ctx.travelByDistrict() == null || district == null) return null;
        DistrictTravel travel = ctx.travelByDistrict().get(district);
        if (travel != null) return travel;
        for (Map.Entry<String, DistrictTravel> entry : ctx.travelByDistrict().entrySet()) {
            if (entry.getKey().equalsIgnoreCase(district)) return entry.getValue();
        }
        return null;
    }
}
