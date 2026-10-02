package lk.techtrithalon.waypoint.planning.domain.rules;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R7: A vehicle may execute at most 2 trips per vehicle-day (or maxTripsPerVehicleDay param).
 */
public class TripCountRule implements ConstraintRule {

    public static final String CODE = "TRIP_COUNT";

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
        return Scope.VEHICLE_DAY;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.trips() == null) {
            return List.of();
        }

        int maxTrips = (ctx.constraintParams() != null && ctx.constraintParams().maxTripsPerVehicleDay() > 0)
            ? ctx.constraintParams().maxTripsPerVehicleDay()
            : 2;

        Map<String, List<PlanTrip>> tripsByVehicle = new HashMap<>();
        for (PlanTrip trip : ctx.trips()) {
            if (trip.vehicleId() != null) {
                tripsByVehicle.computeIfAbsent(trip.vehicleId(), k -> new ArrayList<>()).add(trip);
            }
        }

        List<ConstraintViolation> violations = new ArrayList<>();
        for (Map.Entry<String, List<PlanTrip>> entry : tripsByVehicle.entrySet()) {
            int count = entry.getValue().size();
            if (count > maxTrips) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.VEHICLE_DAY,
                    EntityType.VEHICLE,
                    entry.getKey(),
                    "Vehicle " + entry.getKey() + " is assigned " + count
                        + " trips, exceeding daily limit of " + maxTrips + ".",
                    String.valueOf(count),
                    String.valueOf(maxTrips),
                    "TOO_MANY_TRIPS",
                    Map.of(
                        "vehicleId", entry.getKey(),
                        "tripCount", count,
                        "maxAllowed", maxTrips
                    )
                ));
            }
        }

        return violations;
    }
}
