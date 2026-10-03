package lk.techtrithalon.waypoint.planning.domain.rules;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanStop;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.PlanVehicle;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R6: Total volume and total weight of all orders on a trip must not exceed vehicle capacities.
 */
public class TripCapacityRule implements ConstraintRule {

    public static final String CODE = "TRIP_CAPACITY";

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
        if (ctx == null || ctx.trips() == null || ctx.vehicles() == null) {
            return List.of();
        }

        Map<String, PlanVehicle> vehicleMap = ctx.vehicles().stream()
            .collect(Collectors.toMap(PlanVehicle::vehicleId, Function.identity(), (v1, v2) -> v1));

        List<ConstraintViolation> violations = new ArrayList<>();

        for (PlanTrip trip : ctx.trips()) {
            PlanVehicle vehicle = vehicleMap.get(trip.vehicleId());
            if (vehicle == null) {
                continue;
            }

            BigDecimal totalVolume = BigDecimal.ZERO;
            BigDecimal totalWeight = BigDecimal.ZERO;

            for (PlanStop stop : trip.stops()) {
                PlanOrder order = stop.order();
                if (order != null) {
                    if (order.volumeM3() != null) {
                        totalVolume = totalVolume.add(order.volumeM3());
                    }
                    if (order.weightKg() != null) {
                        totalWeight = totalWeight.add(order.weightKg());
                    }
                }
            }

            if (vehicle.volumeCapM3() != null && totalVolume.compareTo(vehicle.volumeCapM3()) > 0) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.TRIP,
                    EntityType.TRIP,
                    String.valueOf(trip.id()),
                    "Trip " + trip.id() + " total volume (" + totalVolume + " m³) exceeds vehicle "
                        + vehicle.vehicleId() + " capacity (" + vehicle.volumeCapM3() + " m³).",
                    totalVolume.stripTrailingZeros().toPlainString(),
                    vehicle.volumeCapM3().stripTrailingZeros().toPlainString(),
                    "OVER_VOLUME",
                    Map.of(
                        "tripId", trip.id(),
                        "vehicleId", vehicle.vehicleId(),
                        "totalVolumeM3", totalVolume,
                        "volumeCapM3", vehicle.volumeCapM3()
                    )
                ));
            }

            if (vehicle.weightCapKg() != null && totalWeight.compareTo(vehicle.weightCapKg()) > 0) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.TRIP,
                    EntityType.TRIP,
                    String.valueOf(trip.id()),
                    "Trip " + trip.id() + " total weight (" + totalWeight + " kg) exceeds vehicle "
                        + vehicle.vehicleId() + " capacity (" + vehicle.weightCapKg() + " kg).",
                    totalWeight.stripTrailingZeros().toPlainString(),
                    vehicle.weightCapKg().stripTrailingZeros().toPlainString(),
                    "OVER_WEIGHT",
                    Map.of(
                        "tripId", trip.id(),
                        "vehicleId", vehicle.vehicleId(),
                        "totalWeightKg", totalWeight,
                        "weightCapKg", vehicle.weightCapKg()
                    )
                ));
            }
        }

        return violations;
    }
}
