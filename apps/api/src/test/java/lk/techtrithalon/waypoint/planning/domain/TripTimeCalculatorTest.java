package lk.techtrithalon.waypoint.planning.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TripTimeCalculatorTest {

    private TripTimeCalculator calculator;
    private Map<String, Map<String, ServiceAllowance>> serviceAllowances;

    @BeforeEach
    void setUp() {
        calculator = new TripTimeCalculator();
        // Competition booklet service allowances for Fresh
        serviceAllowances = Map.of(
            "Fresh", Map.of(
                "rear_dock", new ServiceAllowance("Fresh", "rear_dock", 15),
                "street", new ServiceAllowance("Fresh", "street", 16),
                "side_dock", new ServiceAllowance("Fresh", "side_dock", 18)
            ),
            "Style", Map.of(
                "rear_dock", new ServiceAllowance("Style", "rear_dock", 12),
                "street", new ServiceAllowance("Style", "street", 14)
            )
        );
    }

    @Test
    void bookletFixtureGampahaFreshThreeStops() {
        // Fresh -> Gampaha: 3 orders (rear_dock, rear_dock, street)
        // depot_to_district = 37, inter_stop = 9
        // 37 + 9 * (3 - 1) + 15 + 15 + 16 = 37 + 18 + 46 = 101 min
        DistrictTravel gampaha = new DistrictTravel(
            "Gampaha", "Peliyagoda", "urban", BigDecimal.valueOf(35.0),
            BigDecimal.valueOf(22.5), 37,
            BigDecimal.valueOf(5.0), 9
        );

        PlanStop stop1 = createStop(1L, "Fresh", "rear_dock");
        PlanStop stop2 = createStop(2L, "Fresh", "rear_dock");
        PlanStop stop3 = createStop(3L, "Fresh", "street");

        PlanTrip trip = new PlanTrip(
            101L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(stop1, stop2, stop3),
            null, null, null
        );

        int minutes = calculator.compute(trip, gampaha, serviceAllowances);
        assertEquals(101, minutes, "Booklet fixture for Gampaha Fresh 3 stops must equal 101 min");
    }

    @Test
    void bookletFixtureColomboFreshFourStops() {
        // Fresh -> Colombo: 4 orders (all street)
        // depot_to_district = 24, inter_stop = 8
        // 24 + 8 * (4 - 1) + 16 * 4 = 24 + 24 + 64 = 112 min
        DistrictTravel colombo = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(12.0), 24,
            BigDecimal.valueOf(3.5), 8
        );

        PlanStop stop1 = createStop(10L, "Fresh", "street");
        PlanStop stop2 = createStop(11L, "Fresh", "street");
        PlanStop stop3 = createStop(12L, "Fresh", "street");
        PlanStop stop4 = createStop(13L, "Fresh", "street");

        PlanTrip trip = new PlanTrip(
            102L, "VEH001", 2, "Fresh", "Colombo",
            List.of(stop1, stop2, stop3, stop4),
            null, null, null
        );

        int minutes = calculator.compute(trip, colombo, serviceAllowances);
        assertEquals(112, minutes, "Booklet fixture for Colombo Fresh 4 stops must equal 112 min");
    }

    @Test
    void bookletCombinedTwoTripsEquals213Minutes() {
        // Combined on one vehicle: 101 + 112 = 213 of 270 Fresh min
        DistrictTravel gampaha = new DistrictTravel(
            "Gampaha", "Peliyagoda", "urban", BigDecimal.valueOf(35.0),
            BigDecimal.valueOf(22.5), 37,
            BigDecimal.valueOf(5.0), 9
        );
        DistrictTravel colombo = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(12.0), 24,
            BigDecimal.valueOf(3.5), 8
        );

        PlanTrip trip1 = new PlanTrip(
            101L, "VEH001", 1, "Fresh", "Gampaha",
            List.of(
                createStop(1L, "Fresh", "rear_dock"),
                createStop(2L, "Fresh", "rear_dock"),
                createStop(3L, "Fresh", "street")
            ),
            null, null, null
        );

        PlanTrip trip2 = new PlanTrip(
            102L, "VEH001", 2, "Fresh", "Colombo",
            List.of(
                createStop(10L, "Fresh", "street"),
                createStop(11L, "Fresh", "street"),
                createStop(12L, "Fresh", "street"),
                createStop(13L, "Fresh", "street")
            ),
            null, null, null
        );

        int trip1Min = calculator.compute(trip1, gampaha, serviceAllowances);
        int trip2Min = calculator.compute(trip2, colombo, serviceAllowances);
        int total = trip1Min + trip2Min;

        assertEquals(101, trip1Min);
        assertEquals(112, trip2Min);
        assertEquals(213, total, "Combined vehicle day must equal 213 min (out of 270 Fresh budget)");
    }

    @Test
    void edgeCasesZeroAndSingleStop() {
        DistrictTravel gampaha = new DistrictTravel(
            "Gampaha", "Peliyagoda", "urban", BigDecimal.valueOf(35.0),
            BigDecimal.valueOf(22.5), 37,
            BigDecimal.valueOf(5.0), 9
        );

        // Zero stops
        PlanTrip emptyTrip = new PlanTrip(200L, "VEH001", 1, "Fresh", "Gampaha", List.of(), null, null, null);
        assertEquals(0, calculator.compute(emptyTrip, gampaha, serviceAllowances));

        // Single stop: depot to district + 1 service allowance (no inter-stop time)
        PlanStop singleStop = createStop(1L, "Fresh", "rear_dock");
        PlanTrip singleStopTrip = new PlanTrip(201L, "VEH001", 1, "Fresh", "Gampaha", List.of(singleStop), null, null, null);
        assertEquals(37 + 15, calculator.compute(singleStopTrip, gampaha, serviceAllowances));
    }

    @Test
    void caseInsensitiveLookup() {
        DistrictTravel colombo = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(12.0), 20,
            BigDecimal.valueOf(3.5), 5
        );

        PlanStop stop = createStop(1L, "FRESH", "REAR_DOCK");
        PlanTrip trip = new PlanTrip(300L, "VEH001", 1, "FRESH", "Colombo", List.of(stop), null, null, null);
        assertEquals(20 + 15, calculator.compute(trip, colombo, serviceAllowances));
    }

    private PlanStop createStop(long id, String brand, String dockType) {
        PlanOrder order = new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, brand, "ambient",
            BigDecimal.valueOf(1.5), BigDecimal.valueOf(100),
            "Gampaha", "Peliyagoda", dockType, "any", null, null
        );
        return new PlanStop(id, id, 1, order, null, null);
    }
}
