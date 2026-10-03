package lk.techtrithalon.waypoint.loading.application;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadTaskStatus;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
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
     * stop goes in first (rear of the vehicle) and the first stop last, nearest the door. When the
     * publication replaces a version, the task for the same vehicle and trip keeps the counts already
     * made (and their open issues) and must be acknowledged before loading continues.
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
            LoadTask replaced = task.replacedPlanId() == null ? null
                : tasks.forSlot(task.replacedPlanId(), task.vehicleId(), task.tripIndex()).orElse(null);
            // A handed-over trip whose orders are unchanged stays handed over (it may already be on the road).
            boolean stillLoaded = replaced != null && replaced.loadedAt() != null && sameOrders(replaced, task);
            long id = tasks.insert(task, loadSequence, replaced == null ? null : replaced.id(), replaced != null && !stillLoaded, now);
            int carried = replaced == null ? 0 : carryCounts(id, task.planVersion(), replaced);
            if (stillLoaded) tasks.inheritLoaded(id, replaced.id());
            ids.add(id);
            Map<String, Object> record = new HashMap<>(Map.of("planId", task.planId(), "planVersion", task.planVersion(),
                "tripId", task.tripId(), "vehicleId", task.vehicleId(), "lines", count, "carriedCounts", carried));
            if (replaced != null) record.put("replacesTaskId", replaced.id());
            if (stillLoaded) record.put("stillLoaded", true);
            audit.record("load_task.created", user, "load_task", String.valueOf(id), null, record, null);
        }
        return ids;
    }

    private static boolean sameOrders(LoadTask replaced, NewLoadTask task) {
        var before = new HashSet<Long>(); replaced.lines().forEach(l -> before.add(l.orderId()));
        var after = new HashSet<Long>(); task.lines().forEach(l -> after.add(l.orderId()));
        return before.equals(after);
    }

    /**
     * Published for the driver: the signed-in driver's current (not superseded) trips on a run, in
     * departure order. Only tasks published to this driver are returned.
     */
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DRIVER')")
    public List<LoadTask> currentForDriver(CurrentUser driver, java.time.LocalDate date) {
        return tasks.activeForDriver(date, driver.id());
    }

    /** Every task published to the driver for a run, replaced versions included (newest first). */
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DRIVER')")
    public List<LoadTask> everForDriver(CurrentUser driver, java.time.LocalDate date) {
        return tasks.allForDriver(date, driver.id());
    }

    /** Current (not superseded) tasks of a run, for publication checks. */
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<LoadTask> currentForRun(CurrentUser user, java.time.LocalDate date, String depot) {
        return tasks.activeForRun(date, depot);
    }

    /** Orders that stay on the same vehicle and trip are already on the vehicle: keep their counts. */
    private int carryCounts(long taskId, int planVersion, LoadTask replaced) {
        var created = tasks.find(taskId, false).orElseThrow();
        Map<Long, LoadLine> before = new HashMap<>();
        replaced.lines().forEach(l -> before.put(l.orderId(), l));
        int carried = 0;
        for (var line : created.lines()) {
            var old = before.get(line.orderId());
            if (old == null || "pending".equals(old.status())) continue;
            tasks.carryLine(line.id(), taskId, old.id(), planVersion);
            carried++;
        }
        if (carried > 0) tasks.inheritStart(taskId, replaced.id());
        return carried;
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
        List<LoadTaskStatus> result = new ArrayList<>();
        for (var task : tasks.forPlan(planId)) {
            var open = tasks.issuesForTask(task.id()).stream().filter(i -> "OPEN".equals(i.status())).toList();
            result.add(new LoadTaskStatus(task.id(), task.tripId(), task.planVersion(), task.status(), open.size(),
                open.stream().anyMatch(LoadingIssue::holdsVehicle)));
        }
        return result;
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<LoadTask> forPlan(CurrentUser user, long planId) {
        return tasks.forPlan(planId);
    }
}
