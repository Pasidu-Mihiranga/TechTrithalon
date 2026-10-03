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

class VehicleAccessRuleTest {

    private VehicleAccessRule rule;

    @BeforeEach
    void setUp() {
        rule = new VehicleAccessRule();
    }

    @Test
    void vanOnlyOutletOnLorryFails() {
        PlanOrder vanOnlyOrder = order(1L, "van_only");
        PlanVehicle lorry = vehicle("VEH001", "lorry");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, vanOnlyOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(lorry), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("VEHICLE_ACCESS", violations.get(0).ruleCode());
        assertEquals("NEEDS_VAN", violations.get(0).remediationCode());
    }

    @Test
    void vanOnlyOutletOnVanPasses() {
        PlanOrder vanOnlyOrder = order(1L, "van_only");
        PlanVehicle van = vehicle("VEH002", "van");

        PlanTrip trip = new PlanTrip(
            1L, "VEH002", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, vanOnlyOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(van), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Van-only order on van vehicle must pass");
    }

    @Test
    void normalOutletOnLorryPasses() {
        PlanOrder normalOrder = order(2L, "any");
        PlanVehicle lorry = vehicle("VEH001", "lorry");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(2L, 2L, 1, normalOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(lorry), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Standard access order on lorry must pass");
    }

    private PlanOrder order(long id, String parkingConstraint) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Style", "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Colombo", "Peliyagoda", "street", parkingConstraint, null, null
        );
    }

    private PlanVehicle vehicle(String id, String type) {
        return new PlanVehicle(
            id, type, "ambient", BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    private PlanContext context(List<PlanVehicle> vehicles, List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
