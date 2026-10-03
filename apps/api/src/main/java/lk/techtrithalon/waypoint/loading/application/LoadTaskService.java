package lk.techtrithalon.waypoint.loading.application;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadTaskStatus;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Published loading boundary. Publication creates and supersedes load tasks through this service,
 * inside its own transaction, so a failed publish leaves no tasks behind.
 */
@Service
public class LoadTaskService {
    private final LoadTaskRepository tasks;
    private final AuditService audit;
    private final Clock clock;

    public LoadTaskService(LoadTaskRepository tasks, AuditService audit, Clock clock) {
        this.tasks = tasks; this.audit = audit; this.clock = clock;
    }

    /**
     * One task per published trip. Lines arrive in stop order and are loaded in reverse: the last
     * stop goes in first (rear of the vehicle) and the first stop last, nearest the door.
     */
    @Transactional
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<Long> createForPublication(CurrentUser user, List<NewLoadTask> published) {
        var now = clock.instant();
        List<Long> ids = new ArrayList<>();
        for (var task : published) {
            if (task.lines().isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "EMPTY_TRIP", "A published trip has no stops");
            var stops = new HashSet<Integer>();
            for (var line : task.lines()) if (!stops.add(line.stopSeq()))
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "DUPLICATE_STOP", "A trip lists the same stop twice");
            int count = task.lines().size();
            List<Integer> loadSequence = task.lines().stream().map(l -> count - l.stopSeq() + 1).toList();
            long id = tasks.insert(task, loadSequence, now);
            ids.add(id);
            audit.record("load_task.created", user, "load_task", String.valueOf(id), null,
                Map.of("planId", task.planId(), "planVersion", task.planVersion(), "tripId", task.tripId(),
                    "vehicleId", task.vehicleId(), "lines", count), null);
        }
        return ids;
    }

    /** Called when a newer plan version replaces this one; the dock must work from the new tasks. */
    @Transactional
    @PreAuthorize("hasRole('DISPATCHER')")
    public int supersedeForPlan(CurrentUser user, long planId, long byPlanId) {
        int changed = tasks.supersedeForPlan(planId, clock.instant());
        if (changed > 0) audit.record("load_task.superseded", user, "plan", String.valueOf(planId), null,
            Map.of("supersededByPlanId", byPlanId, "tasks", changed), null);
        return changed;
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<LoadTaskStatus> statusForPlan(CurrentUser user, long planId) {
        return tasks.statusForPlan(planId);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<LoadTask> forPlan(CurrentUser user, long planId) {
        return tasks.forPlan(planId);
    }
}
