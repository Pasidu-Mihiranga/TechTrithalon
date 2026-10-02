package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanConstraintParams;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TimeBudgetRuleTest {

    private TimeBudgetRule rule;

    @BeforeEach
    void setUp() {
        rule = new TimeBudgetRule();
    }

    @Test
    void freshTripsUnderBudgetPasses() {
        // 101 + 112 = 213 <= 270 min -> Passes!
        PlanTrip t1 = new PlanTrip(1L, "VEH001", 1, "Fresh", "Gampaha", List.of(), 101, null, null);
        PlanTrip t2 = new PlanTrip(2L, "VEH001", 2, "Fresh", "Colombo", List.of(), 112, null, null);

        PlanContext ctx = context(List.of(t1, t2));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "213 min is within 270 min Fresh budget");
    }

    @Test
    void freshTripsOverBudgetFails() {
        // 150 + 130 = 280 > 270 min -> Fails!
        PlanTrip t1 = new PlanTrip(1L, "VEH001", 1, "Fresh", "Gampaha", List.of(), 150, null, null);
        PlanTrip t2 = new PlanTrip(2L, "VEH001", 2, "Fresh", "Colombo", List.of(), 130, null, null);

        PlanContext ctx = context(List.of(t1, t2));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TIME_BUDGET", violations.get(0).ruleCode());
        assertEquals("FRESH_TIME_BUDGET_EXCEEDED", violations.get(0).remediationCode());
    }

    @Test
    void styleTechTripsOverBudgetFails() {
        // 300 + 200 = 500 > 480 min -> Fails!
        PlanTrip t1 = new PlanTrip(1L, "VEH002", 1, "Style", "Colombo", List.of(), 300, null, null);
        PlanTrip t2 = new PlanTrip(2L, "VEH002", 2, "Tech", "Colombo", List.of(), 200, null, null);

        PlanContext ctx = context(List.of(t1, t2));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TIME_BUDGET", violations.get(0).ruleCode());
        assertEquals("OTHER_TIME_BUDGET_EXCEEDED", violations.get(0).remediationCode());
    }

    private PlanContext context(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), trips, Map.of(), Map.of(), Map.of(),
            null, PlanConstraintParams.standard()
        );
    }
}
