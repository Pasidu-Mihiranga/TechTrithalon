package lk.techtrithalon.waypoint.planning.domain.rules;

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
 * R3: Outlets with van-only access constraints must be served by a van vehicle.
 */
public class VehicleAccessRule implements ConstraintRule {

    public static final String CODE = "VEHICLE_ACCESS";

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
        return Scope.ORDER_VEHICLE;
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

            boolean isVehicleVan = "van".equalsIgnoreCase(vehicle.type());

            for (PlanStop stop : trip.stops()) {
                PlanOrder order = stop.order();
                if (order == null || order.parkingConstraint() == null) {
                    continue;
                }

                boolean isVanOnly = "van_only".equalsIgnoreCase(order.parkingConstraint())
                    || "van only".equalsIgnoreCase(order.parkingConstraint());

                if (isVanOnly && !isVehicleVan) {
                    violations.add(new ConstraintViolation(
                        CODE,
                        Severity.HARD,
                        Scope.ORDER_VEHICLE,
                        EntityType.ORDER,
                        order.orderRef(),
                        "Outlet for order " + order.orderRef() + " requires van-only access, but vehicle "
                            + vehicle.vehicleId() + " is a " + vehicle.type() + ".",
                        vehicle.type(),
                        "van",
                        "NEEDS_VAN",
                        Map.of(
                            "orderRef", order.orderRef(),
                            "vehicleId", vehicle.vehicleId(),
                            "parkingConstraint", order.parkingConstraint(),
                            "vehicleType", vehicle.type()
                        )
                    ));
                }
            }
        }

        return violations;
    }
}
