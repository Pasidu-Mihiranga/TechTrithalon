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

class SameBrandDistrictRuleTest {

    private SameBrandDistrictRule rule;

    @BeforeEach
    void setUp() {
        rule = new SameBrandDistrictRule();
    }

    @Test
    void allOrdersMatchBrandAndDistrictPasses() {
        PlanOrder o1 = order(1L, "Fresh", "Gampaha");
        PlanOrder o2 = order(2L, "Fresh", "Gampaha");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = contextWithTrips(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertTrue(violations.isEmpty(), "Matching brand and district must have no violations");
    }

    @Test
    void mixedBrandGeneratesViolation() {
        PlanOrder o1 = order(1L, "Fresh", "Gampaha");
        PlanOrder o2 = order(2L, "Style", "Gampaha");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = contextWithTrips(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertEquals(1, violations.size());
        assertEquals("SAME_BRAND_DISTRICT", violations.get(0).ruleCode());
        assertEquals("SPLIT_BY_BRAND", violations.get(0).remediationCode());
    }

    @Test
    void mixedDistrictGeneratesViolation() {
        PlanOrder o1 = order(1L, "Fresh", "Gampaha");
        PlanOrder o2 = order(2L, "Fresh", "Colombo");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = contextWithTrips(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertEquals(1, violations.size());
        assertEquals("SAME_BRAND_DISTRICT", violations.get(0).ruleCode());
        assertEquals("SPLIT_BY_DISTRICT", violations.get(0).remediationCode());
    }

    private PlanOrder order(long id, String brand, String district) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, brand, "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            district, "Peliyagoda", "rear_dock", "any", null, null
        );
    }

    private PlanContext contextWithTrips(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
