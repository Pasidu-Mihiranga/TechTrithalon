package lk.techtrithalon.waypoint.planning.domain;

import java.util.List;

/**
 * An independently evaluable operational constraint predicate.
 */
public interface ConstraintRule {
    String code();
    Severity severity();
    Scope scope();
    List<ConstraintViolation> evaluate(PlanContext ctx);
}
