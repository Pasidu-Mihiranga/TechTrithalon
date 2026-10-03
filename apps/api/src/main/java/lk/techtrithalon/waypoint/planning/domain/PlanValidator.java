package lk.techtrithalon.waypoint.planning.domain;

import java.util.ArrayList;
import java.util.List;
import lk.techtrithalon.waypoint.planning.domain.rules.DeliveryWindowRule;
import lk.techtrithalon.waypoint.planning.domain.rules.DepotAffinityRule;
import lk.techtrithalon.waypoint.planning.domain.rules.FuelQuotaRule;
import lk.techtrithalon.waypoint.planning.domain.rules.OperatingDayRule;
import lk.techtrithalon.waypoint.planning.domain.rules.SameBrandDistrictRule;
import lk.techtrithalon.waypoint.planning.domain.rules.TemperatureCompatibilityRule;
import lk.techtrithalon.waypoint.planning.domain.rules.TimeBudgetRule;
import lk.techtrithalon.waypoint.planning.domain.rules.TripCapacityRule;
import lk.techtrithalon.waypoint.planning.domain.rules.TripCountRule;
import lk.techtrithalon.waypoint.planning.domain.rules.VehicleAccessRule;
import lk.techtrithalon.waypoint.planning.domain.rules.VehicleAvailabilityRule;
import lk.techtrithalon.waypoint.planning.domain.rules.WholeOrderRule;

/**
 * Independent operational validator that executes R1–R12 constraint rules against a {@link PlanContext}.
 *
 * <p><strong>Architectural Guarantee:</strong> The validator shares no code with the solver or planner.
 * Any plan must pass this validator with zero HARD violations before it can be considered feasible or published.
 */
public class PlanValidator {

    private final List<ConstraintRule> rules;
    private final PlanMetricsCalculator metricsCalculator;

    public PlanValidator() {
        this(defaultRules(), new PlanMetricsCalculator());
    }

    public PlanValidator(List<ConstraintRule> rules, PlanMetricsCalculator metricsCalculator) {
        this.rules = rules != null ? List.copyOf(rules) : defaultRules();
        this.metricsCalculator = metricsCalculator != null ? metricsCalculator : new PlanMetricsCalculator();
    }

    public static List<ConstraintRule> defaultRules() {
        return List.of(
            new SameBrandDistrictRule(),
            new TemperatureCompatibilityRule(),
            new VehicleAccessRule(),
            new DepotAffinityRule(),
            new WholeOrderRule(),
            new TripCapacityRule(),
            new TripCountRule(),
            new DeliveryWindowRule(),
            new FuelQuotaRule(),
            new OperatingDayRule(),
            new TimeBudgetRule(),
            new VehicleAvailabilityRule()
        );
    }

    public PlanValidationReport validate(PlanContext ctx) {
        List<ConstraintViolation> violations = new ArrayList<>();
        for (ConstraintRule rule : rules) {
            List<ConstraintViolation> ruleViolations = rule.evaluate(ctx);
            if (ruleViolations != null && !ruleViolations.isEmpty()) {
                violations.addAll(ruleViolations);
            }
        }

        int hardViolationCount = (int) violations.stream()
            .filter(v -> v.severity() == Severity.HARD)
            .count();

        boolean feasible = hardViolationCount == 0;
        PlanMetrics metrics = metricsCalculator.compute(ctx, hardViolationCount);

        return new PlanValidationReport(violations, feasible, metrics);
    }

    public List<ConstraintRule> rules() {
        return rules;
    }
}
