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
import lk.techtrithalon.waypoint.planning.domain.PlanVehicle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DepotAffinityRuleTest {

    private DepotAffinityRule rule;

    @BeforeEach
    void setUp() {
        rule = new DepotAffinityRule();
    }

    @Test
    void crossDepotAssignmentFails() {
        PlanOrder ratmalanaOrder = order(1L, "Ratmalana");
        PlanVehicle peliyagodaVehicle = vehicle("VEH001", "Peliyagoda");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Tech", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, ratmalanaOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(peliyagodaVehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("DEPOT_AFFINITY", violations.get(0).ruleCode());
        assertEquals("WRONG_DEPOT", violations.get(0).remediationCode());
    }

    @Test
    void sameDepotAssignmentPasses() {
        PlanOrder peliyagodaOrder = order(1L, "Peliyagoda");
        PlanVehicle peliyagodaVehicle = vehicle("VEH001", "Peliyagoda");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Tech", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, peliyagodaOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(peliyagodaVehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Matching depot must pass");
    }

    private PlanOrder order(long id, String depot) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Tech", "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Colombo", depot, "street", "any", null, null
        );
    }

    private PlanVehicle vehicle(String id, String depot) {
        return new PlanVehicle(
            id, "lorry", "ambient", BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            depot, BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    private PlanContext context(List<PlanVehicle> vehicles, List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
