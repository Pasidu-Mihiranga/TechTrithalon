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

class TripCapacityRuleTest {

    private TripCapacityRule rule;
    private PlanVehicle vehicle;

    @BeforeEach
    void setUp() {
        rule = new TripCapacityRule();
        // Capacity: 5000 kg, 38.0 m³
        vehicle = new PlanVehicle(
            "VEH001", "lorry", "ambient",
            BigDecimal.valueOf(5000), BigDecimal.valueOf(38.0),
            "Peliyagoda", BigDecimal.valueOf(8.0), BigDecimal.valueOf(300.0), "available"
        );
    }

    @Test
    void underCapacityPasses() {
        PlanOrder o1 = order(1L, BigDecimal.valueOf(10.0), BigDecimal.valueOf(1500));
        PlanOrder o2 = order(2L, BigDecimal.valueOf(20.0), BigDecimal.valueOf(2500));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Under volume (30/38) and weight (4000/5000) must pass");
    }

    @Test
    void overVolumeFails() {
        // 40.0 m³ > 38.0 m³
        PlanOrder o1 = order(1L, BigDecimal.valueOf(25.0), BigDecimal.valueOf(1000));
        PlanOrder o2 = order(2L, BigDecimal.valueOf(15.0), BigDecimal.valueOf(1000));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TRIP_CAPACITY", violations.get(0).ruleCode());
        assertEquals("OVER_VOLUME", violations.get(0).remediationCode());
    }

    @Test
    void overWeightFails() {
        // 5500 kg > 5000 kg
        PlanOrder o1 = order(1L, BigDecimal.valueOf(10.0), BigDecimal.valueOf(3000));
        PlanOrder o2 = order(2L, BigDecimal.valueOf(10.0), BigDecimal.valueOf(2500));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null), new PlanStop(2L, 2L, 2, o2, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TRIP_CAPACITY", violations.get(0).ruleCode());
        assertEquals("OVER_WEIGHT", violations.get(0).remediationCode());
    }

    @Test
    void exactBoundaryCapacityPasses() {
        // Exactly 38.0 m³ and 5000 kg
        PlanOrder o1 = order(1L, BigDecimal.valueOf(38.0), BigDecimal.valueOf(5000));

        PlanTrip trip = new PlanTrip(
            1L, "VEH001", 1, "Style", "Colombo",
            List.of(new PlanStop(1L, 1L, 1, o1, null, null)),
            null, null, null
        );

        PlanContext ctx = context(List.of(vehicle), List.of(trip));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Exact capacity match must pass");
    }

    private PlanOrder order(long id, BigDecimal vol, BigDecimal wt) {
        return new PlanOrder(
            id, "ORD-" + id, "OUT-" + id, "Style", "ambient",
            vol, wt, "Colombo", "Peliyagoda", "street", "any", null, null
        );
    }

    private PlanContext context(List<PlanVehicle> vehicles, List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), vehicles, trips, Map.of(), Map.of(), Map.of(), null, null
        );
    }
}
