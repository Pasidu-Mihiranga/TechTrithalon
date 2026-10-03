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

class VehicleAvailabilityRuleTest {

    private VehicleAvailabilityRule rule;

    @BeforeEach
    void setUp() {
        rule = new VehicleAvailabilityRule();
    }

    @Test
    void availableVehicleWithStopsPasses() {
        PlanVehicle vehicle = vehicle("VEH001", "available");
        PlanOrder order = order(1L);
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Fresh", "Gampaha", List.of(new PlanStop(1L, 1L, 1, order, null, null)), null, null, null);

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Available vehicle with stops must pass");
    }

    @Test
    void maintenanceVehicleWithStopsFails() {
        PlanVehicle vehicle = vehicle("VEH002", "maintenance");
        PlanOrder order = order(1L);
        PlanTrip trip = new PlanTrip(1L, "VEH002", 1, "Fresh", "Gampaha", List.of(new PlanStop(1L, 1L, 1, order, null, null)), null, null, null);

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("VEHICLE_AVAILABILITY", violations.get(0).ruleCode());
        assertEquals("VEHICLE_UNAVAILABLE", violations.get(0).remediationCode());
    }

    @Test
    void maintenanceVehicleWithoutStopsIgnored() {
        // Vehicle in maintenance, but no stops assigned to it -> No operational violation
        PlanVehicle vehicle = vehicle("VEH002", "maintenance");
        PlanTrip emptyTrip = new PlanTrip(1L, "VEH002", 1, "Fresh", "Gampaha", List.of(), null, null, null);

        PlanContext ctx = context(List.of(vehicle), List.of(emptyTrip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Vehicle in maintenance with 0 stops assigned does not produce a violation");
    }

    private PlanOrder order(long id) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Fresh", "ambient",
            BigDecimal.ONE, BigDecimal.valueOf(100),
            "Gampaha", "Peliyagoda", "rear_dock", "any", null, null
        );
    }

    private PlanVehicle vehicle(String id, String status) {
        return new PlanVehicle(
            id, "lorry", "ambient", BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), status
        );
    }

    private PlanContext context(List<PlanVehicle> vehicles, List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
