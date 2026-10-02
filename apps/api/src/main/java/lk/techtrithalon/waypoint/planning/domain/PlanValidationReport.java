package lk.techtrithalon.waypoint.planning.domain;

import java.util.Collections;
import java.util.List;

/**
 * Report containing all evaluated constraint violations, feasibility status, and plan metrics.
 */
public record PlanValidationReport(
    List<ConstraintViolation> violations,
    boolean feasible,
    PlanMetrics metrics
) {
    public PlanValidationReport {
        violations = violations != null ? Collections.unmodifiableList(violations) : Collections.emptyList();
    }

    public List<ConstraintViolation> hardViolations() {
        return violations.stream().filter(v -> v.severity() == Severity.HARD).toList();
    }

    public List<ConstraintViolation> infoViolations() {
        return violations.stream().filter(v -> v.severity() == Severity.INFO).toList();
    }
}
