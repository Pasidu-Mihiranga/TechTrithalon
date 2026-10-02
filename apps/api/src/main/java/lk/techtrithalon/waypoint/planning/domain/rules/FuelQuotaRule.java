package lk.techtrithalon.waypoint.planning.domain.rules;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.DistanceFuelCalculator;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.PlanVehicle;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * R9: Total weekly fuel (previously committed this week + this candidate plan) must not exceed weekly fuel quota.
 *
 * <p>Enforced strictly as a HARD constraint by the independent validator.
 */
public class FuelQuotaRule implements ConstraintRule {

    public static final String CODE = "FUEL_QUOTA";

    private final DistanceFuelCalculator distanceFuelCalculator = new DistanceFuelCalculator();

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
        if (ctx == null || ctx.vehicles() == null || ctx.trips() == null) {
            return List.of();
        }

        Map<String, PlanVehicle> vehicleMap = ctx.vehicles().stream()
            .collect(Collectors.toMap(PlanVehicle::vehicleId, Function.identity(), (v1, v2) -> v1));

        Map<String, List<PlanTrip>> tripsByVehicle = new HashMap<>();
        for (PlanTrip trip : ctx.trips()) {
            if (trip.vehicleId() != null) {
                tripsByVehicle.computeIfAbsent(trip.vehicleId(), k -> new ArrayList<>()).add(trip);
            }
        }

        List<ConstraintViolation> violations = new ArrayList<>();

        for (Map.Entry<String, List<PlanTrip>> entry : tripsByVehicle.entrySet()) {
            String vehicleId = entry.getKey();
            PlanVehicle vehicle = vehicleMap.get(vehicleId);
            if (vehicle == null || vehicle.weeklyFuelQuotaL() == null) {
                continue;
            }

            BigDecimal committed = BigDecimal.ZERO;
            if (ctx.fuelCommittedThisWeek() != null && ctx.fuelCommittedThisWeek().containsKey(vehicleId)) {
                committed = ctx.fuelCommittedThisWeek().get(vehicleId);
            }

            BigDecimal planFuel = BigDecimal.ZERO;
            for (PlanTrip trip : entry.getValue()) {
                if (trip.fuelLitres() != null) {
                    planFuel = planFuel.add(trip.fuelLitres());
                } else {
                    DistrictTravel travel = ctx.travelByDistrict() != null ? ctx.travelByDistrict().get(trip.district()) : null;
                    DistanceFuelCalculator.TripDistanceFuel df = distanceFuelCalculator.compute(trip, travel, vehicle);
                    planFuel = planFuel.add(df.fuelLitres());
                }
            }

            BigDecimal totalFuel = committed.add(planFuel);
            if (totalFuel.compareTo(vehicle.weeklyFuelQuotaL()) > 0) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.VEHICLE_DAY,
                    EntityType.VEHICLE,
                    vehicleId,
                    "Vehicle " + vehicleId + " weekly fuel requirement (" + totalFuel
                        + " L = " + committed + " L committed + " + planFuel + " L this plan) exceeds weekly quota ("
                        + vehicle.weeklyFuelQuotaL() + " L).",
                    totalFuel.stripTrailingZeros().toPlainString(),
                    vehicle.weeklyFuelQuotaL().stripTrailingZeros().toPlainString(),
                    "FUEL_QUOTA_EXCEEDED",
                    Map.of(
                        "vehicleId", vehicleId,
                        "committedFuelL", committed,
                        "planFuelL", planFuel,
                        "totalFuelL", totalFuel,
                        "weeklyFuelQuotaL", vehicle.weeklyFuelQuotaL()
                    )
                ));
            }
        }

        return violations;
    }
}
