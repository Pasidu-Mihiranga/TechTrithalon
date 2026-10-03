package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.PlanVehicle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FuelQuotaRuleTest {

    private FuelQuotaRule rule;
    private PlanVehicle vehicle;

    @BeforeEach
    void setUp() {
        rule = new FuelQuotaRule();
        // Quota = 300.0 L
        vehicle = new PlanVehicle(
            "VEH001", "lorry", "ambient",
            BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    @Test
    void withinQuotaPasses() {
        // Committed: 200 L, Plan fuel: 50 L -> Total: 250 L <= 300 L -> Passes!
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Fresh", "Colombo", List.of(), 100, BigDecimal.valueOf(40), BigDecimal.valueOf(50.0));

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(vehicle), List.of(trip),
            Map.of(), Map.of(), Map.of("VEH001", BigDecimal.valueOf(200.0)),
            null, null
        );

        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertTrue(violations.isEmpty(), "Fuel within weekly quota must pass");
    }

    @Test
    void exceedingQuotaFails() {
        // Committed: 260 L, Plan fuel: 50 L -> Total: 310 L > 300 L -> Fails!
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Fresh", "Colombo", List.of(), 100, BigDecimal.valueOf(40), BigDecimal.valueOf(50.0));

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(vehicle), List.of(trip),
            Map.of(), Map.of(), Map.of("VEH001", BigDecimal.valueOf(260.0)),
            null, null
        );

        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertEquals(1, violations.size());
        assertEquals("FUEL_QUOTA", violations.get(0).ruleCode());
        assertEquals("FUEL_QUOTA_EXCEEDED", violations.get(0).remediationCode());
    }

    @Test
    void exactBoundaryPasses() {
        // Committed: 250 L, Plan fuel: 50 L -> Total: 300 L == 300 L -> Passes!
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Fresh", "Colombo", List.of(), 100, BigDecimal.valueOf(40), BigDecimal.valueOf(50.0));

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(vehicle), List.of(trip),
            Map.of(), Map.of(), Map.of("VEH001", BigDecimal.valueOf(250.0)),
            null, null
        );

        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertTrue(violations.isEmpty(), "Exact quota boundary must pass");
    }
}
