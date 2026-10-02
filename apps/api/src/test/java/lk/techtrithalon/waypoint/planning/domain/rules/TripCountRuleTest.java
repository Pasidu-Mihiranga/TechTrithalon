package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanConstraintParams;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TripCountRuleTest {

    private TripCountRule rule;

    @BeforeEach
    void setUp() {
        rule = new TripCountRule();
    }

    @Test
    void oneOrTwoTripsPasses() {
        PlanTrip t1 = new PlanTrip(1L, "VEH001", 1, "Fresh", "Gampaha", List.of(), null, null, null);
        PlanTrip t2 = new PlanTrip(2L, "VEH001", 2, "Fresh", "Colombo", List.of(), null, null, null);

        PlanContext ctx = context(List.of(t1, t2));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertTrue(violations.isEmpty(), "Up to 2 trips per vehicle per day must pass");
    }

    @Test
    void threeTripsOnSameVehicleFails() {
        PlanTrip t1 = new PlanTrip(1L, "VEH001", 1, "Fresh", "Gampaha", List.of(), null, null, null);
        PlanTrip t2 = new PlanTrip(2L, "VEH001", 2, "Fresh", "Colombo", List.of(), null, null, null);
        PlanTrip t3 = new PlanTrip(3L, "VEH001", 3, "Fresh", "Gampaha", List.of(), null, null, null);

        PlanContext ctx = context(List.of(t1, t2, t3));
        List<ConstraintViolation> violations = rule.evaluate(ctx);

        assertEquals(1, violations.size());
        assertEquals("TRIP_COUNT", violations.get(0).ruleCode());
        assertEquals("TOO_MANY_TRIPS", violations.get(0).remediationCode());
    }

    private PlanContext context(List<PlanTrip> trips) {
        return new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), trips, Map.of(), Map.of(), Map.of(),
            null, PlanConstraintParams.standard()
        );
    }
}
