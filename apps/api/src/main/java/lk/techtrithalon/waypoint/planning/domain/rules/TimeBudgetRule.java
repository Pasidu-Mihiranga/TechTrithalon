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
import lk.techtrithalon.waypoint.planning.domain.TripTimeCalculator;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * R11: Total duration of Fresh trips on a vehicle must be <= 270 min (03:30-08:00 window),
 * and Style/Tech trips must be <= 480 min (08:00-16:00 window).
 */
public class TimeBudgetRule implements ConstraintRule {

    public static final String CODE = "TIME_BUDGET";

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
        return Scope.VEHICLE_DAY;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.trips() == null) {
            return List.of();
        }

        int maxFresh = (ctx.constraintParams() != null && ctx.constraintParams().freshBudgetMinutes() > 0)
            ? ctx.constraintParams().freshBudgetMinutes()
            : 270;

        int maxOther = (ctx.constraintParams() != null && ctx.constraintParams().otherBudgetMinutes() > 0)
            ? ctx.constraintParams().otherBudgetMinutes()
            : 480;

        Map<String, List<PlanTrip>> tripsByVehicle = new HashMap<>();
        for (PlanTrip trip : ctx.trips()) {
            if (trip.vehicleId() != null) {
                tripsByVehicle.computeIfAbsent(trip.vehicleId(), k -> new ArrayList<>()).add(trip);
            }
        }

        List<ConstraintViolation> violations = new ArrayList<>();

        for (Map.Entry<String, List<PlanTrip>> entry : tripsByVehicle.entrySet()) {
            String vehicleId = entry.getKey();
            int freshMinutes = 0;
            int otherMinutes = 0;

            for (PlanTrip trip : entry.getValue()) {
                int tripMin = (trip.tripMinutes() != null && trip.tripMinutes() > 0)
                    ? trip.tripMinutes()
                    : computeTripMinutes(trip, ctx);

                if ("Fresh".equalsIgnoreCase(trip.brand())) {
                    freshMinutes += tripMin;
                } else {
                    otherMinutes += tripMin;
                }
            }

            if (freshMinutes > maxFresh) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.VEHICLE_DAY,
                    EntityType.VEHICLE,
                    vehicleId,
                    "Vehicle " + vehicleId + " Fresh trips total " + freshMinutes
                        + " minutes, exceeding allowed Fresh budget of " + maxFresh + " minutes.",
                    String.valueOf(freshMinutes),
                    String.valueOf(maxFresh),
                    "FRESH_TIME_BUDGET_EXCEEDED",
                    Map.of(
                        "vehicleId", vehicleId,
                        "brandCategory", "Fresh",
                        "actualMinutes", freshMinutes,
                        "budgetMinutes", maxFresh
                    )
                ));
            }

            if (otherMinutes > maxOther) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.VEHICLE_DAY,
                    EntityType.VEHICLE,
                    vehicleId,
                    "Vehicle " + vehicleId + " Style/Tech trips total " + otherMinutes
                        + " minutes, exceeding allowed budget of " + maxOther + " minutes.",
                    String.valueOf(otherMinutes),
                    String.valueOf(maxOther),
                    "OTHER_TIME_BUDGET_EXCEEDED",
                    Map.of(
                        "vehicleId", vehicleId,
                        "brandCategory", "Other",
                        "actualMinutes", otherMinutes,
                        "budgetMinutes", maxOther
                    )
                ));
            }
        }

        return violations;
    }

    private int computeTripMinutes(PlanTrip trip, PlanContext ctx) {
        DistrictTravel travel = ctx.travelByDistrict() != null ? ctx.travelByDistrict().get(trip.district()) : null;
        if (travel == null && ctx.travelByDistrict() != null && trip.district() != null) {
            for (Map.Entry<String, DistrictTravel> e : ctx.travelByDistrict().entrySet()) {
                if (e.getKey().equalsIgnoreCase(trip.district())) {
                    travel = e.getValue();
                    break;
                }
            }
        }
        return tripTimeCalculator.compute(trip, travel, ctx.serviceByBrandDock());
    }
}
