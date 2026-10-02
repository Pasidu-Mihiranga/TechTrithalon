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
 * R2: Chilled orders require a refrigerated vehicle (reefer). Reefer vehicles may also carry ambient orders.
 */
public class TemperatureCompatibilityRule implements ConstraintRule {

    public static final String CODE = "TEMPERATURE_COMPATIBILITY";

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

            boolean isVehicleReefer = "reefer".equalsIgnoreCase(vehicle.temp());

            for (PlanStop stop : trip.stops()) {
                PlanOrder order = stop.order();
                if (order == null || order.temp() == null) {
                    continue;
                }

                boolean isOrderChilled = "chilled".equalsIgnoreCase(order.temp());
                if (isOrderChilled && !isVehicleReefer) {
                    violations.add(new ConstraintViolation(
                        CODE,
                        Severity.HARD,
                        Scope.ORDER_VEHICLE,
                        EntityType.ORDER,
                        order.orderRef(),
                        "Order " + order.orderRef() + " requires chilled transport but vehicle "
                            + vehicle.vehicleId() + " is ambient.",
                        vehicle.temp(),
                        "reefer",
                        "NEEDS_REEFER",
                        Map.of(
                            "orderRef", order.orderRef(),
                            "vehicleId", vehicle.vehicleId(),
                            "requiredTemp", "chilled",
                            "vehicleTemp", vehicle.temp()
                        )
                    ));
                }
            }
        }

        return violations;
    }
}
