package lk.techtrithalon.waypoint.planning.domain;

import java.util.Collections;
import java.util.Map;

/**
 * Structured violation recorded when a planning constraint rule fails.
 */
public record ConstraintViolation(
    String ruleCode,
    Severity severity,
    Scope scope,
    EntityType entityType,
    String entityId,
    String message,
    String actualValue,
    String allowedValue,
    String remediationCode,
    Map<String, Object> evidence
) {
    public ConstraintViolation {
        evidence = evidence != null ? Collections.unmodifiableMap(evidence) : Collections.emptyMap();
    }
}
