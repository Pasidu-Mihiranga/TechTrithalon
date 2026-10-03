package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanStop;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WholeOrderRuleTest {

    private WholeOrderRule rule;

    @BeforeEach
    void setUp() {
        rule = new WholeOrderRule();
    }

    @Test
    void distinctOrdersPass() {
        PlanOrder o1 = order(1L);
        PlanOrder o2 = order(2L);

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Distinct order assignments must pass");
    }

    @Test
    void duplicateOrderAssignmentAcrossStopsFails() {
        PlanOrder o1 = order(1L);

        PlanTrip trip1 = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null)),
            null, null, null
        );
        PlanTrip trip2 = new PlanTrip(
            2L, "VEH002", 1, "Fresh", "Colombo",
            List.of(new PlanStop(2L, 1L, 1, o1, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(trip1, trip2));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("WHOLE_ORDER", violations.get(0).ruleCode());
        assertEquals("DUPLICATE_ORDER_ASSIGNMENT", violations.get(0).remediationCode());
    }

    private PlanOrder order(long id) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Fresh", "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Colombo", "Peliyagoda", "street", "any", null, null
        );
    }

    private PlanContext context(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
