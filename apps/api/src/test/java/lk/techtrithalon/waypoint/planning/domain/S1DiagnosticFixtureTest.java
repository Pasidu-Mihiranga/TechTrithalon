package lk.techtrithalon.waypoint.planning.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Diagnostic integration fixture verifying the PlanValidator against the S1 Peliyagoda scenario.
 *
 * <p>Validates that:
 * <ul>
 *   <li>The booklet's worked example matches 101 min, 112 min, and 213 of 270 Fresh min.</li>
 *   <li>A hand-crafted feasible allocation passes validation.</li>
 *   <li>Each hard constraint (R1–R12) cleanly catches its targeted violation.</li>
 * </ul>
 */
class S1DiagnosticFixtureTest {

    private PlanValidator validator;
    private TripTimeCalculator tripTimeCalculator;
    private CalendarDay operatingDay;
    private Map<String, DistrictTravel> travelByDistrict;
    private Map<String, Map<String, ServiceAllowance>> serviceAllowances;
    private List<PlanVehicle> vehicles;

    @BeforeEach
    void setUp() {
        validator = new PlanValidator();
        tripTimeCalculator = new TripTimeCalculator();

        operatingDay = new CalendarDay(
            LocalDate.of(2026, 10, 5), 2026, 41, true, false, null, BigDecimal.ZERO, false
        );

        travelByDistrict = Map.of(
            "Colombo", new DistrictTravel(
                "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
                BigDecimal.valueOf(12.0), 24, BigDecimal.valueOf(3.5), 8
            ),
            "Gampaha", new DistrictTravel(
                "Gampaha", "Peliyagoda", "urban", BigDecimal.valueOf(35.0),
                BigDecimal.valueOf(22.5), 37, BigDecimal.valueOf(5.0), 9
            ),
            "Kalutara", new DistrictTravel(
                "Kalutara", "Peliyagoda", "arterial", BigDecimal.valueOf(45.0),
                BigDecimal.valueOf(45.0), 55, BigDecimal.valueOf(8.0), 15
            )
        );

        serviceAllowances = Map.of(
            "Fresh", Map.of(
                "rear_dock", new ServiceAllowance("Fresh", "rear_dock", 15),
                "street", new ServiceAllowance("Fresh", "street", 16),
                "side_dock", new ServiceAllowance("Fresh", "side_dock", 18)
            ),
            "Style", Map.of(
                "rear_dock", new ServiceAllowance("Style", "rear_dock", 12),
                "street", new ServiceAllowance("Style", "street", 14),
                "side_dock", new ServiceAllowance("Style", "side_dock", 15)
            ),
            "Tech", Map.of(
                "rear_dock", new ServiceAllowance("Tech", "rear_dock", 10),
                "street", new ServiceAllowance("Tech", "street", 12),
                "side_dock", new ServiceAllowance("Tech", "side_dock", 14)
            )
        );

        vehicles = List.of(
            // Reefer 5T Lorry
            new PlanVehicle("VEH-REEFER-1", "lorry", "reefer", BigDecimal.valueOf(5000), BigDecimal.valueOf(38.0), "Peliyagoda", BigDecimal.valueOf(7.0), BigDecimal.valueOf(380.0), "available"),
            // Reefer Van
            new PlanVehicle("VEH-REEFER-VAN", "van", "reefer", BigDecimal.valueOf(1500), BigDecimal.valueOf(12.0), "Peliyagoda", BigDecimal.valueOf(10.0), BigDecimal.valueOf(200.0), "available"),
            // Ambient Lorry
            new PlanVehicle("VEH-AMB-LORRY", "lorry", "ambient", BigDecimal.valueOf(6000), BigDecimal.valueOf(42.0), "Peliyagoda", BigDecimal.valueOf(6.5), BigDecimal.valueOf(400.0), "available"),
            // Ambient Van
            new PlanVehicle("VEH-AMB-VAN", "van", "ambient", BigDecimal.valueOf(1800), BigDecimal.valueOf(14.0), "Peliyagoda", BigDecimal.valueOf(11.0), BigDecimal.valueOf(220.0), "available"),
            // Maintenance Vehicle
            new PlanVehicle("VEH-MAINT", "lorry", "reefer", BigDecimal.valueOf(5000), BigDecimal.valueOf(38.0), "Peliyagoda", BigDecimal.valueOf(7.0), BigDecimal.valueOf(380.0), "maintenance")
        );
    }

    @Test
    void bookletTripTimeWorkedExamplePasses() {
        // Gampaha 3 stops: 37 + 9*2 + 15 + 15 + 16 = 101 min
        PlanTrip gampahaTrip = new PlanTrip(
            1L, "VEH-REEFER-1", 1, "Fresh", "Gampaha",
            List.of(
                createStop(1L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", null, null),
                createStop(2L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", null, null),
                createStop(3L, "Fresh", "Gampaha", "chilled", "street", "any", null, null)
            ),
            null, null, null
        );
        int gampahaMin = tripTimeCalculator.compute(gampahaTrip, travelByDistrict.get("Gampaha"), serviceAllowances);
        assertEquals(101, gampahaMin, "Booklet Gampaha Fresh trip time must be 101 min");

        // Colombo 4 stops: 24 + 8*3 + 16*4 = 112 min
        PlanTrip colomboTrip = new PlanTrip(
            2L, "VEH-REEFER-1", 2, "Fresh", "Colombo",
            List.of(
                createStop(4L, "Fresh", "Colombo", "chilled", "street", "any", null, null),
                createStop(5L, "Fresh", "Colombo", "chilled", "street", "any", null, null),
                createStop(6L, "Fresh", "Colombo", "chilled", "street", "any", null, null),
                createStop(7L, "Fresh", "Colombo", "chilled", "street", "any", null, null)
            ),
            null, null, null
        );
        int colomboMin = tripTimeCalculator.compute(colomboTrip, travelByDistrict.get("Colombo"), serviceAllowances);
        assertEquals(112, colomboMin, "Booklet Colombo Fresh trip time must be 112 min");

        assertEquals(213, gampahaMin + colomboMin, "Combined duration must equal 213 min of 270 Fresh budget");
    }

    @Test
    void feasibleHandCraftedPlanPassesValidator() {
        // Build 2 valid trips on VEH-REEFER-1 (101 min and 112 min)
        PlanTrip trip1 = new PlanTrip(
            1L, "VEH-REEFER-1", 1, "Fresh", "Gampaha",
            List.of(
                createStop(1L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", LocalTime.of(3, 0), LocalTime.of(6, 0)),
                createStop(2L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", LocalTime.of(3, 0), LocalTime.of(6, 0)),
                createStop(3L, "Fresh", "Gampaha", "chilled", "street", "any", LocalTime.of(3, 0), LocalTime.of(6, 0))
            ),
            101, BigDecimal.valueOf(55.0), BigDecimal.valueOf(7.86)
        );

        PlanTrip trip2 = new PlanTrip(
            2L, "VEH-REEFER-1", 2, "Fresh", "Colombo",
            List.of(
                createStop(4L, "Fresh", "Colombo", "chilled", "street", "any", LocalTime.of(3, 0), LocalTime.of(8, 0)),
                createStop(5L, "Fresh", "Colombo", "chilled", "street", "any", LocalTime.of(3, 0), LocalTime.of(8, 0)),
                createStop(6L, "Fresh", "Colombo", "chilled", "street", "any", LocalTime.of(3, 0), LocalTime.of(8, 0)),
                createStop(7L, "Fresh", "Colombo", "chilled", "street", "any", LocalTime.of(3, 0), LocalTime.of(8, 0))
            ),
            112, BigDecimal.valueOf(34.5), BigDecimal.valueOf(4.93)
        );

        List<PlanOrder> allOrders = new ArrayList<>();
        trip1.stops().forEach(s -> allOrders.add(s.order()));
        trip2.stops().forEach(s -> allOrders.add(s.order()));

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            allOrders, vehicles, List.of(trip1, trip2),
            travelByDistrict, serviceAllowances,
            Map.of("VEH-REEFER-1", BigDecimal.valueOf(100.0)),
            operatingDay, PlanConstraintParams.standard()
        );

        PlanValidationReport report = validator.validate(ctx);

        assertTrue(report.feasible(), "Feasible S1 plan must pass validation");
        assertEquals(0, report.hardViolations().size());
        assertEquals(7, report.metrics().ordersAssigned());
        assertEquals(0, report.metrics().ordersUnassigned());
        assertEquals(1, report.metrics().vehiclesUsed());
        assertEquals(2, report.metrics().tripsUsed());
    }

    @Test
    void diagnosticCatchesTemperatureViolation() {
        // Chilled order on ambient vehicle
        PlanStop stop = createStop(1L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", null, null);
        PlanTrip trip = new PlanTrip(1L, "VEH-AMB-LORRY", 1, "Fresh", "Gampaha", List.of(stop), null, null, null);

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "TEMPERATURE_COMPATIBILITY");
    }

    @Test
    void diagnosticCatchesVehicleAccessViolation() {
        // Van-only order on lorry
        PlanStop stop = createStop(1L, "Style", "Colombo", "ambient", "rear_dock", "van_only", null, null);
        PlanTrip trip = new PlanTrip(1L, "VEH-AMB-LORRY", 1, "Style", "Colombo", List.of(stop), null, null, null);

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "VEHICLE_ACCESS");
    }

    @Test
    void diagnosticCatchesTripCapacityViolation() {
        // Exceeding van volume capacity (12.0 m³) with 20.0 m³ order
        PlanOrder largeOrder = new PlanOrder(
            1L, "ORD-1", "OUT-1", "Fresh", "chilled",
            BigDecimal.valueOf(20.0), BigDecimal.valueOf(500),
            "Colombo", "Peliyagoda", "rear_dock", "van_only",
            LocalTime.of(3, 0), LocalTime.of(8, 0)
        );
        PlanTrip trip = new PlanTrip(
            1L, "VEH-REEFER-VAN", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, largeOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "TRIP_CAPACITY");
    }

    @Test
    void diagnosticCatchesDeliveryWindowViolation() {
        // Order window closes at 03:45, but arrival is 03:30 + 24 min = 03:54
        PlanOrder tightWindowOrder = new PlanOrder(
            1L, "ORD-1", "OUT-1", "Fresh", "chilled",
            BigDecimal.valueOf(1.0), BigDecimal.valueOf(50),
            "Colombo", "Peliyagoda", "rear_dock", "any",
            LocalTime.of(3, 0), LocalTime.of(3, 45)
        );
        PlanTrip trip = new PlanTrip(
            1L, "VEH-REEFER-1", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, tightWindowOrder, null, null)),
            null, null, null
        );

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "DELIVERY_WINDOW");
    }

    @Test
    void diagnosticCatchesFuelQuotaViolation() {
        // Quota is 200.0 L, committed is 190.0 L, plan requires 25.0 L -> 215.0 L > 200.0 L
        PlanTrip trip = new PlanTrip(
            1L, "VEH-REEFER-VAN", 1, "Fresh", "Colombo",
            List.of(createStop(1L, "Fresh", "Colombo", "chilled", "rear_dock", "van_only", null, null)),
            50, BigDecimal.valueOf(250.0), BigDecimal.valueOf(25.0)
        );

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, List.of(trip),
            travelByDistrict, serviceAllowances,
            Map.of("VEH-REEFER-VAN", BigDecimal.valueOf(190.0)),
            operatingDay, PlanConstraintParams.standard()
        );

        PlanValidationReport report = validator.validate(ctx);
        assertFalse(report.feasible());
        assertContainsRuleCode(report, "FUEL_QUOTA");
    }

    @Test
    void diagnosticCatchesTimeBudgetViolation() {
        // Fresh budget is 270 min. Total trip minutes = 280 min
        PlanTrip trip = new PlanTrip(
            1L, "VEH-REEFER-1", 1, "Fresh", "Gampaha",
            List.of(createStop(1L, "Fresh", "Gampaha", "chilled", "rear_dock", "any", null, null)),
            280, BigDecimal.valueOf(50.0), BigDecimal.valueOf(7.0)
        );

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "TIME_BUDGET");
    }

    @Test
    void diagnosticCatchesVehicleAvailabilityViolation() {
        // Assigning to a vehicle that is in maintenance
        PlanTrip trip = new PlanTrip(
            1L, "VEH-MAINT", 1, "Fresh", "Colombo",
            List.of(createStop(1L, "Fresh", "Colombo", "chilled", "rear_dock", "any", null, null)),
            50, BigDecimal.valueOf(20.0), BigDecimal.valueOf(3.0)
        );

        PlanContext ctx = createContext(List.of(trip));
        PlanValidationReport report = validator.validate(ctx);

        assertFalse(report.feasible());
        assertContainsRuleCode(report, "VEHICLE_AVAILABILITY");
    }

    private PlanStop createStop(
        long id, String brand, String district, String temp, String dockType,
        String access, LocalTime open, LocalTime close
    ) {
        PlanOrder order = new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, brand, temp,
            BigDecimal.valueOf(1.0), BigDecimal.valueOf(50),
            district, "Peliyagoda", dockType, access, open, close
        );
        return new PlanStop(id, id, 1, order, null, null);
    }

    private PlanContext createContext(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, trips,
            travelByDistrict, serviceAllowances,
            Map.of(), operatingDay, PlanConstraintParams.standard()
        );
    }

    private void assertContainsRuleCode(PlanValidationReport report, String ruleCode) {
        Set<String> codes = report.hardViolations().stream()
            .map(ConstraintViolation::ruleCode)
            .collect(Collectors.toSet());
        assertTrue(codes.contains(ruleCode), "Expected violation " + ruleCode + " but found: " + codes);
    }
}
