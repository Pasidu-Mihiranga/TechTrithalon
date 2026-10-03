package lk.techtrithalon.waypoint.loading.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The dispatcher's side of loading shortfalls: see them before departure and decide. */
@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class LoadingIssueService {
    public static final List<String> DECISIONS = List.of("SEND_SHORT", "REPLANNED");

    private final LoadTaskRepository tasks;
    private final AuditService audit;
    private final Clock clock;

    public LoadingIssueService(LoadTaskRepository tasks, AuditService audit, Clock clock) {
        this.tasks = tasks; this.audit = audit; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<LoadingIssue> forRun(CurrentUser user, LocalDate date, String depot, String status) {
        String selected = depot == null || depot.isBlank() ? user.depot() : depot;
        if (selected == null) throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED", "Choose a depot");
        if (!user.canAccessDepot(selected)) throw missing();
        if (status != null && !List.of("OPEN", "RESOLVED").contains(status))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Use OPEN or RESOLVED");
        return tasks.issuesForRun(date, selected, status);
    }

    /**
     * SEND_SHORT lets the vehicle leave with the available units; REPLANNED records that a revised plan
     * handles it. Either releases a hold. The store sees the short count on its receipt later.
     */
    @Transactional
    public LoadingIssue resolve(CurrentUser user, long id, int expectedVersion, String decision, String note) {
        var issue = tasks.findIssue(id, true).orElseThrow(LoadingIssueService::missing);
        if (!user.canAccessDepot(issue.depot())) throw missing();
        if (!DECISIONS.contains(decision)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DECISION", "Use SEND_SHORT or REPLANNED");
        if ("RESOLVED".equals(issue.status()))
            throw new LoaderConflictException("ISSUE_RESOLVED", "This issue was already decided", Map.of("decision", issue.decision()));
        if (!tasks.resolveIssue(id, expectedVersion, decision, note.trim(), user.id(), user.displayName(), clock.instant()))
            throw new LoaderConflictException("STALE_ISSUE", "The issue changed; reload it", Map.of("version", issue.version()));
        var after = tasks.findIssue(id, false).orElseThrow();
        audit.record("loading_issue.resolved", user, "loading_issue", String.valueOf(id), issue, after, note);
        return after;
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
}
