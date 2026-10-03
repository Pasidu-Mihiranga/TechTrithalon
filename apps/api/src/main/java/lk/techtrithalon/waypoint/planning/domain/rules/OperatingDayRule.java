package lk.techtrithalon.waypoint.planning.domain.rules;

import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R10: Deliveries can only be planned on official calendar operating days.
 */
public class OperatingDayRule implements ConstraintRule {

    public static final String CODE = "OPERATING_DAY";

    @Override
    public String code() {
        return CODE;
    }

    @Override
    public Severity severity() {
        return Severity.HARD;
    }

    @Override
    public Scope scope() {
        return Scope.PLAN;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null) {
            return List.of();
        }

        boolean isOperating = (ctx.calendar() != null) && ctx.calendar().operating();
        if (!isOperating) {
            String dateStr = ctx.planDate() != null ? ctx.planDate().toString() : "N/A";
            return List.of(new ConstraintViolation(
                CODE,
                Severity.HARD,
                Scope.PLAN,
                EntityType.PLAN,
                dateStr,
                "Plan date " + dateStr + " is a non-operating day.",
                "non-operating",
                "operating",
                "NON_OPERATING_DAY",
                Map.of(
                    "planDate", dateStr,
                    "calendarOperating", isOperating
                )
            ));
        }

        return List.of();
    }
}
