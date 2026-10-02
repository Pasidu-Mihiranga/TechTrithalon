package lk.techtrithalon.waypoint.planning.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ArrivalCalculatorTest {

    private ArrivalCalculator calculator;
    private DistrictTravel travel;
    private Map<String, Map<String, ServiceAllowance>> serviceAllowances;

    @BeforeEach
    void setUp() {
        calculator = new ArrivalCalculator();
        // depot to district = 30 min, inter stop = 10 min
        travel = new DistrictTravel(
            "Colombo", "Peliyagoda", "urban", BigDecimal.valueOf(30.0),
            BigDecimal.valueOf(15.0), 30,
            BigDecimal.valueOf(3.0), 10
        );
        serviceAllowances = Map.of(
            "Fresh", Map.of(
                "rear_dock", new ServiceAllowance("Fresh", "rear_dock", 15),
                "street", new ServiceAllowance("Fresh", "street", 20)
            )
        );
    }

    @Test
    void standardArrivalWithinWindowNoWaiting() {
        // Departure 03:30
        // Stop 0: arrival = 03:30 + 30 min = 04:00. Window [03:00, 06:00].
        // serviceStart = 04:00. serviceAllowance = 15 min. serviceEnd = 04:15.
        // Stop 1: arrival = 04:15 + 10 min = 04:25. Window [04:00, 06:00].
        // serviceStart = 04:25. serviceAllowance = 20 min. serviceEnd = 04:45.
        PlanOrder o1 = createOrder(1L, "Fresh", "rear_dock", LocalTime.of(3, 0), LocalTime.of(6, 0));
        PlanOrder o2 = createOrder(2L, "Fresh", "street", LocalTime.of(4, 0), LocalTime.of(6, 0));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        List<ArrivalCalculator.ScheduledStop> schedule = calculator.schedule(
            trip, travel, serviceAllowances, LocalTime.of(3, 30)
        );

        assertEquals(2, schedule.size());

        ArrivalCalculator.ScheduledStop s1 = schedule.get(0);
        assertEquals(LocalTime.of(4, 0), s1.plannedArrival());
        assertEquals(LocalTime.of(4, 0), s1.serviceStart());
        assertEquals(LocalTime.of(4, 15), s1.serviceEnd());
        assertEquals(0, s1.waitMinutes());
        assertFalse(s1.isLate());

        ArrivalCalculator.ScheduledStop s2 = schedule.get(1);
        assertEquals(LocalTime.of(4, 25), s2.plannedArrival());
        assertEquals(LocalTime.of(4, 25), s2.serviceStart());
        assertEquals(LocalTime.of(4, 45), s2.serviceEnd());
        assertEquals(0, s2.waitMinutes());
        assertFalse(s2.isLate());
    }

    @Test
    void earlyArrivalWaitsAndCascadesToNextStop() {
        // Departure 03:30
        // Stop 0: arrives 04:00. Window open is 04:30! (Arrives 30 min early)
        // Vehicle WAITS until 04:30.
        // serviceStart = 04:30. serviceAllowance = 15 min. serviceEnd = 04:45.
        // Stop 1: arrival = 04:45 + 10 min = 04:55. (Cascaded!)
        PlanOrder o1 = createOrder(1L, "Fresh", "rear_dock", LocalTime.of(4, 30), LocalTime.of(6, 0));
        PlanOrder o2 = createOrder(2L, "Fresh", "street", LocalTime.of(4, 0), LocalTime.of(6, 0));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        List<ArrivalCalculator.ScheduledStop> schedule = calculator.schedule(
            trip, travel, serviceAllowances, LocalTime.of(3, 30)
        );

        ArrivalCalculator.ScheduledStop s1 = schedule.get(0);
        assertEquals(LocalTime.of(4, 0), s1.plannedArrival());
        assertEquals(LocalTime.of(4, 30), s1.serviceStart(), "Service should start at window open when arriving early");
        assertEquals(LocalTime.of(4, 45), s1.serviceEnd());
        assertEquals(30, s1.waitMinutes());
        assertFalse(s1.isLate());

        ArrivalCalculator.ScheduledStop s2 = schedule.get(1);
        assertEquals(LocalTime.of(4, 55), s2.plannedArrival(), "Waiting at stop 0 must push stop 1 arrival later");
        assertEquals(LocalTime.of(4, 55), s2.serviceStart());
    }

    @Test
    void lateArrivalFlagsIsLate() {
        // Departure 03:30
        // Stop 0: arrives 04:00. Window close is 03:45. Late!
        PlanOrder o1 = createOrder(1L, "Fresh", "rear_dock", LocalTime.of(3, 0), LocalTime.of(3, 45));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Fresh", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null)),
            null, null, null
        );

        List<ArrivalCalculator.ScheduledStop> schedule = calculator.schedule(
            trip, travel, serviceAllowances, LocalTime.of(3, 30)
        );

        ArrivalCalculator.ScheduledStop s1 = schedule.get(0);
        assertEquals(LocalTime.of(4, 0), s1.plannedArrival());
        assertTrue(s1.isLate(), "Arrival after window close must flag isLate");
    }

    @Test
    void effectiveWindowMallIntersection() {
        // Standard window: 08:00 - 18:00
        // Mall window: 09:30 - 14:00
        // Effective: [09:30, 14:00]
        ArrivalCalculator.EffectiveWindow eff = ArrivalCalculator.computeEffectiveWindow(
            LocalTime.of(8, 0), LocalTime.of(18, 0),
            LocalTime.of(9, 30), LocalTime.of(14, 0)
        );
        assertEquals(LocalTime.of(9, 30), eff.open());
        assertEquals(LocalTime.of(14, 0), eff.close());
        assertTrue(eff.servable());

        // Disjoint window: Standard 08:00-10:00, Mall 11:00-14:00 -> unservable!
        ArrivalCalculator.EffectiveWindow unservable = ArrivalCalculator.computeEffectiveWindow(
            LocalTime.of(8, 0), LocalTime.of(10, 0),
            LocalTime.of(11, 0), LocalTime.of(14, 0)
        );
        assertFalse(unservable.servable());
    }

    private PlanOrder createOrder(long id, String brand, String dockType, LocalTime open, LocalTime close) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, brand, "ambient",
            BigDecimal.valueOf(1.0), BigDecimal.valueOf(50),
            "Colombo", "Peliyagoda", dockType, "any", open, close
        );
    }
}
