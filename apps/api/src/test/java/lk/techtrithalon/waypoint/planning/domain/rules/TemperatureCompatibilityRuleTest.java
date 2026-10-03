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

class TemperatureCompatibilityRuleTest {

    private TemperatureCompatibilityRule rule;

    @BeforeEach
    void setUp() {
        rule = new TemperatureCompatibilityRule();
    }

    @Test
    void chilledOrderOnAmbientVehicleFails() {
        PlanOrder chilledOrder = order(1L, "chilled");
        PlanVehicle ambientVehicle = vehicle("VEH001", "ambient");

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(1L, 1L, 1, chilledOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(chilledOrder), List.of(ambientVehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TEMPERATURE_COMPATIBILITY", violations.get(0).ruleCode());
        assertEquals("NEEDS_REEFER", violations.get(0).remediationCode());
    }

    @Test
    void chilledOrderOnReeferVehiclePasses() {
        PlanOrder chilledOrder = order(1L, "chilled");
        PlanVehicle reeferVehicle = vehicle("VEH002", "reefer");

        PlanTrip trip = new PlanTrip(
            1L, "VEH002", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(1L, 1L, 1, chilledOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(chilledOrder), List.of(reeferVehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Chilled on reefer must pass");
    }

    @Test
    void ambientOrderOnReeferVehiclePasses() {
        PlanOrder ambientOrder = order(2L, "ambient");
        PlanVehicle reeferVehicle = vehicle("VEH002", "reefer");

        PlanTrip trip = new PlanTrip(
            1L, "VEH002", 1, "Fresh", "Gampaha",
            List.of(new PlanStop(2L, 2L, 1, ambientOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(ambientOrder), List.of(reeferVehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Reefer can carry ambient goods");
    }

    private PlanOrder order(long id, String temp) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Fresh", temp,
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Gampaha", "Peliyagoda", "rear_dock", "any", null, null
        );
    }

    private PlanVehicle vehicle(String id, String temp) {
        return new PlanVehicle(
            id, "lorry", temp, BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    private PlanContext context(List<PlanOrder> orders, List<PlanVehicle> vehicles, List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            orders, vehicles, trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
