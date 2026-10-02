package lk.techtrithalon.waypoint.planning.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DistanceFuelCalculatorTest {

    private DistanceFuelCalculator calculator;
    private DistrictTravel travel;
    private PlanVehicle vehicle;

    @BeforeEach
    void setUp() {
        calculator = new DistanceFuelCalculator();
        // depot to district = 20.0 km, inter stop = 4.0 km
        travel = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(20.0), 25,
            BigDecimal.valueOf(4.0), 10
        );
        // kmPerL = 8.0, weeklyQuota = 300.0 L
        vehicle = new PlanVehicle(
            "VEH001", "lorry", "ambient",
            BigDecimal.valueOf(5000), BigDecimal.valueOf(38),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    @Test
    void includesReturnLegInDistance() {
        // 3 stops:
        // distance = 2 * depot_to_district_km + inter_stop_km * (3 - 1)
        //          = 2 * 20.0 + 4.0 * 2 = 40.0 + 8.0 = 48.0 km
        // fuel = 48.0 / 8.0 = 6.00 L
        PlanStop s1 = new PlanStop(1L, 1L, 1, null, null, null);
        PlanStop s2 = new PlanStop(2L, 2L, 2, null, null, null);
        PlanStop s3 = new PlanStop(3L, 3L, 3, null, null, null);

        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Style", "Colombo", List.of(s1, s2, s3), null, null, null);

        DistanceFuelCalculator.TripDistanceFuel result = calculator.compute(trip, travel, vehicle);

        assertEquals(new BigDecimal("48.00"), result.distanceKm());
        assertEquals(new BigDecimal("6.00"), result.fuelLitres());
    }

    @Test
    void zeroStopsProducesZeroDistanceAndFuel() {
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Style", "Colombo", List.of(), null, null, null);
        DistanceFuelCalculator.TripDistanceFuel result = calculator.compute(trip, travel, vehicle);

        assertEquals(new BigDecimal("0.00"), result.distanceKm());
        assertEquals(new BigDecimal("0.00"), result.fuelLitres());
    }

    @Test
    void singleStopIncludesReturnLegWithoutInterStop() {
        // 1 stop:
        // distance = 2 * 20.0 + 4.0 * 0 = 40.00 km
        // fuel = 40.0 / 8.0 = 5.00 L
        PlanStop s1 = new PlanStop(1L, 1L, 1, null, null, null);
        PlanTrip trip = new PlanTrip(1L, "VEH001", 1, "Style", "Colombo", List.of(s1), null, null, null);

        DistanceFuelCalculator.TripDistanceFuel result = calculator.compute(trip, travel, vehicle);

        assertEquals(new BigDecimal("40.00"), result.distanceKm());
        assertEquals(new BigDecimal("5.00"), result.fuelLitres());
    }

    @Test
    void fuelRoundingToTwoDecimalsHalfUp() {
        // kmPerL = 7.0
        // distance = 48.00 km
        // fuel = 48.0 / 7.0 = 6.85714... -> 6.86 L
        DistanceFuelCalculator.TripDistanceFuel result = calculator.compute(3, travel, BigDecimal.valueOf(7.0));

        assertEquals(new BigDecimal("48.00"), result.distanceKm());
        assertEquals(new BigDecimal("6.86"), result.fuelLitres());
    }
}
