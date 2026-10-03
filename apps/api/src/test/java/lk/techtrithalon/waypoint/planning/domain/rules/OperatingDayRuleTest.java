package lk.techtrithalon.waypoint.planning.domain.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class OperatingDayRuleTest {

    private OperatingDayRule rule;

    @BeforeEach
    void setUp() {
        rule = new OperatingDayRule();
    }

    @Test
    void operatingDayPasses() {
        CalendarDay operatingDay = new CalendarDay(
            LocalDate.of(2026, 10, 5), 2026, 41, true, false, null, BigDecimal.ZERO, false
        );

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 5), "Peliyagoda",
            List.of(), List.of(), List.of(),
            Map.of(), Map.of(), Map.of(),
            operatingDay, null
        );

        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertTrue(violations.isEmpty(), "Operating day must have no violations");
    }

    @Test
    void nonOperatingDayFails() {
        CalendarDay nonOperatingDay = new CalendarDay(
            LocalDate.of(2026, 10, 4), 2026, 40, false, false, "Sunday", BigDecimal.ZERO, false
        );

        PlanContext ctx = new PlanContext(
            LocalDate.of(2026, 10, 4), "Peliyagoda",
            List.of(), List.of(), List.of(),
            Map.of(), Map.of(), Map.of(),
            nonOperatingDay, null
        );

        List<ConstraintViolation> violations = rule.evaluate(ctx);
        assertEquals(1, violations.size());
        assertEquals("OPERATING_DAY", violations.get(0).ruleCode());
        assertEquals("NON_OPERATING_DAY", violations.get(0).remediationCode());
    }
}
