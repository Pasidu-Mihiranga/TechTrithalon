package lk.techtrithalon.waypoint.planning.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PlanValidatorTest {

    private PlanValidator validator;
    private CalendarDay operatingDay;
    private DistrictTravel travel;
    private Map<String, Map<String, ServiceAllowance>> allowances;
    private PlanVehicle reeferVehicle;

    @BeforeEach
    void setUp() {
        validator = new PlanValidator();
        operatingDay = new CalendarDay(
            LocalDate.of(2026, 10, 5), 2026, 41, true, false, null, BigDecimal.ZERO, false
        );
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
        reeferVehicle = new PlanVehicle(
            "VEH001", "lorry", "reefer",
            BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    @Test
    void fullyFeasiblePlanPassesValidation() {
        PlanOrder order1 = new PlanOrder(
            1L, "ORD-1", "OUT-1", "Fresh", "chilled",
            BigDecimal.valueOf(5.0), BigDecimal.valueOf(500),
            "Colombo", "Peliyagoda", "rear_dock", "any",
            LocalTime.of(3, 0), LocalTime.of(6, 0)
        );
        PlanOrder order2 = new PlanOrder(
            2L, "ORD-2", "OUT-2", "Fresh", "ambient",
            BigDecimal.valueOf(10.0), BigDecimal.valueOf(1000),
            "Colombo", "Peliyagoda", "rear_dock", "any",
            LocalTime.of(3, 0), LocalTime.of(6, 0)
        );

        PlanStop s1 = new PlanStop(1L, 1L, 1, order1, null, null);
        PlanStop s2 = new PlanStop(2L, 2L, 2, order2, null, null);

        PlanTrip trip = new PlanTrip(
            101L, "VEH001", 1, "Fresh", "Colombo",
            List.of(s1, s2), null, null, null
        );

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(order1, order2), List.of(reeferVehicle), List.of(trip),
            Map.of("Colombo", travel), allowances,
            Map.of("VEH001", BigDecimal.valueOf(50.0)),
            operatingDay, PlanConstraintParams.standard()
        );

        PlanValidationReport report = validator.validate(ctx);

        assertTrue(report.feasible(), "Valid plan must be feasible");
        assertTrue(report.hardViolations().isEmpty(), "No hard violations expected");
        assertEquals(2, report.metrics().ordersAssigned());
        assertEquals(0, report.metrics().ordersUnassigned());
        assertEquals(1, report.metrics().vehiclesUsed());
        assertEquals(1, report.metrics().tripsUsed());
        assertTrue(report.metrics().totalDistanceKm().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void planWithMultipleHardViolationsIsFlaggedInfeasible() {
        // Violations:
        // 1. Chilled on ambient vehicle (R2)
        // 2. Van-only order on lorry (R3)
        // 3. Exceeds volume capacity (R6)
        PlanVehicle ambientLorry = new PlanVehicle(
            "VEH002", "lorry", "ambient",
            BigDecimal.valueOf(5000), BigDecimal.valueOf(10.0), // small volume: 10 m³
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );

        PlanOrder badOrder = new PlanOrder(
            1L, "ORD-1", "OUT-1", "Fresh", "chilled", // chilled on ambient
            BigDecimal.valueOf(25.0), BigDecimal.valueOf(500), // 25 m³ > 10 m³
            "Colombo", "Peliyagoda", "rear_dock", "van_only", // van_only on lorry
            LocalTime.of(3, 0), LocalTime.of(6, 0)
        );

        PlanStop s1 = new PlanStop(1L, 1L, 1, badOrder, null, null);
        PlanTrip trip = new PlanTrip(
            101L, "VEH002", 1, "Fresh", "Colombo",
            List.of(s1), null, null, null
        );

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(badOrder), List.of(ambientLorry), List.of(trip),
            Map.of("Colombo", travel), allowances, Map.of(),
            operatingDay, PlanConstraintParams.standard()
        );

        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible(), "Plan with violations must be infeasible");
        assertTrue(report.hardViolations().size() >= 3, "Expected at least 3 hard violations");
        assertEquals(report.hardViolations().size(), report.metrics().hardViolationCount());
    }
}
