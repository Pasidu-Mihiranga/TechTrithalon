package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanConstraintParams;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanStop;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DeliveryWindowRuleTest {

    private DeliveryWindowRule rule;
    private DistrictTravel travel;
    private Map<String, Map<String, ServiceAllowance>> allowances;

    @BeforeEach
    void setUp() {
        rule = new DeliveryWindowRule();
        travel = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(15.0), 30,
            BigDecimal.valueOf(3.0), 10
        );
        allowances = Map.of(
            "Fresh", Map.of(
                "rear_dock", new ServiceAllowance("Fresh", "rear_dock", 15)
            )
        );
    }

    @Test
    void arrivalWithinWindowPasses() {
        // Departure 03:30 + 30 = 04:00. Window: [03:00, 05:00] -> Passes!
        PlanOrder o1 = order(1L, LocalTime.of(3, 0), LocalTime.of(5, 0));
        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Arrival at 04:00 within [03:00, 05:00] must pass");
    }

    @Test
    void arrivalAfterWindowCloseFails() {
        // Departure 03:30 + 30 = 04:00. Window: [03:00, 03:45] -> Late!
        PlanOrder o1 = order(1L, LocalTime.of(3, 0), LocalTime.of(3, 45));
        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("DELIVERY_WINDOW", violations.get(0).ruleCode());
        assertEquals("WINDOW_LATE", violations.get(0).remediationCode());
    }

    private PlanOrder order(long id, LocalTime open, LocalTime close) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Fresh", "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Colombo", "Peliyagoda", "rear_dock", "any", open, close
        );
    }

    private PlanContext context(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), trips,
            Map.of("Colombo", travel), allowances, Map.of(),
            null, PlanConstraintParams.standard()
        );
    }
}
