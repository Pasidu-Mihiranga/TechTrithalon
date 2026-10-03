package lk.techtrithalon.waypoint.planning.application;

import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.PlanValidationReport;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

public class ManualPlanValidationException extends ApiException {
    private final PlanValidationReport report;
    public ManualPlanValidationException(PlanValidationReport report) {
        super(HttpStatus.UNPROCESSABLE_ENTITY,"PLAN_INFEASIBLE","The edit violates planning constraints; nothing was saved");
        this.report=report;
    }
    @Override public Map<String,Object> properties() { return Map.of("violations",report.violations(),"metrics",report.metrics()); }
}
