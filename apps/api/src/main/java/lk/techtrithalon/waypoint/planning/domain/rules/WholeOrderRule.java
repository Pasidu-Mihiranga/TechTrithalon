package lk.techtrithalon.waypoint.planning.domain.rules;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanStop;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R5: Each customer order can be scheduled on at most one delivery stop across the entire plan.
 */
public class WholeOrderRule implements ConstraintRule {

    public static final String CODE = "WHOLE_ORDER";

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
        return Scope.PLAN;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.trips() == null) {
            return List.of();
        }

        Map<Long, List<String>> orderStopOccurrences = new HashMap<>();
        Map<Long, String> orderRefMap = new HashMap<>();

        for (PlanTrip trip : ctx.trips()) {
            for (PlanStop stop : trip.stops()) {
                PlanOrder order = stop.order();
                long orderId = (order != null) ? order.id() : stop.orderId();
                String ref = (order != null) ? order.orderRef() : String.valueOf(orderId);

                orderRefMap.put(orderId, ref);
                orderStopOccurrences.computeIfAbsent(orderId, k -> new ArrayList<>())
                    .add("Trip " + trip.id() + " Stop " + stop.stopIndex());
            }
        }

        List<ConstraintViolation> violations = new ArrayList<>();
        for (Map.Entry<Long, List<String>> entry : orderStopOccurrences.entrySet()) {
            if (entry.getValue().size() > 1) {
                String ref = orderRefMap.get(entry.getKey());
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.PLAN,
                    EntityType.ORDER,
                    ref,
                    "Order " + ref + " is assigned to multiple stops (" + entry.getValue().size()
                        + " times): " + String.join(", ", entry.getValue()) + ".",
                    String.valueOf(entry.getValue().size()),
                    "1",
                    "DUPLICATE_ORDER_ASSIGNMENT",
                    Map.of(
                        "orderId", entry.getKey(),
                        "orderRef", ref,
                        "occurrences", entry.getValue()
                    )
                ));
            }
        }

        return violations;
    }
}
