package lk.techtrithalon.waypoint.loading.application;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoaderViews;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dock's workflow on the current manifest: count each order, report shortfalls before departure,
 * acknowledge a republished manifest, and hand the loaded trip to the driver. Scoped to the loader's depot.
 */
@Service
@PreAuthorize("hasRole('LOADER')")
public class LoaderService {
    public static final List<String> SHORTFALL_KINDS = List.of("MISSING", "DAMAGED", "WRONG_ITEM");

    private final LoadTaskRepository tasks;
    private final AuditService audit;
    private final Clock clock;
    private final ReferenceProperties referenceProperties;

    public LoaderService(LoadTaskRepository tasks, AuditService audit, Clock clock, ReferenceProperties referenceProperties) {
        this.tasks = tasks; this.audit = audit; this.clock = clock; this.referenceProperties = referenceProperties;
    }

    @Transactional(readOnly = true)
    public LoaderViews.Board board(CurrentUser user, LocalDate date) {
        String depot = depot(user);
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        var run = tasks.activeForRun(day, depot);
        var issues = tasks.issuesForRun(day, depot, null);
        Map<Long, List<LoadingIssue>> byTask = new HashMap<>();
        issues.forEach(i -> byTask.computeIfAbsent(i.loadTaskId(), k -> new ArrayList<>()).add(i));
        var cards = run.stream().map(t -> card(t, byTask.getOrDefault(t.id(), List.of()))).toList();
        int orders = run.stream().mapToInt(t -> t.lines().size()).sum();
        int counted = run.stream().mapToInt(t -> (int) t.lines().stream().filter(l -> !"pending".equals(l.status())).count()).sum();
        var open = issues.stream().filter(i -> "OPEN".equals(i.status())).toList();
        var next = cards.stream().filter(c -> !"loaded".equals(c.status())).findFirst().orElse(null);
        Integer version = run.stream().map(LoadTask::planVersion).max(Integer::compare).orElse(null);
        return new LoaderViews.Board(day, depot, version, new LoaderViews.Summary(run.size(), orders, counted, open.size()), cards, next, open);
    }

    @Transactional(readOnly = true)
    public LoaderViews.Detail detail(CurrentUser user, long id) {
        var task = load(user, id, false);
        return detail(task);
    }

    @Transactional
    public LoaderViews.Detail acknowledge(CurrentUser user, long id, int expectedVersion) {
        var task = writable(user, id, expectedVersion, false);
        if (task.acknowledgementRequired() && task.acknowledgedAt() == null) {
            var now = clock.instant();
            tasks.acknowledge(id, user.id(), now);
            tasks.bumpVersion(id, expectedVersion, now);
            audit.record("load_task.acknowledged", user, "load_task", String.valueOf(id), null,
                Map.of("planVersion", task.planVersion(), "vehicleId", task.vehicleId()), null);
        }
        return detail(tasks.find(id, false).orElseThrow());
    }

    /** The order's full count is on the vehicle. */
    @Transactional
    public LoaderViews.Detail confirmLine(CurrentUser user, long id, long lineId, int expectedVersion) {
        var task = writable(user, id, expectedVersion, true);
        var line = line(task, lineId);
        if (!"pending".equals(line.status()))
            throw new LoaderConflictException("LINE_ALREADY_COUNTED", "This order was already counted", Map.of("lineId", lineId));
        var now = clock.instant();
        tasks.recordLine(lineId, "loaded", line.units(), user.id(), now);
        tasks.markStarted(id, user.id(), now);
        tasks.bumpVersion(id, expectedVersion, now);
        audit.record("load_line.loaded", user, "load_task", String.valueOf(id), null,
            Map.of("orderRef", line.orderRef(), "units", line.units()), null);
        return detail(tasks.find(id, false).orElseThrow());
    }

    /**
     * A shortfall found before departure: the order is loaded with fewer units, and the dispatcher is
     * told. When it holds the vehicle, the trip cannot be handed over until the dispatcher decides.
     */
    @Transactional
    public LoaderViews.Detail reportShortfall(CurrentUser user, long id, long lineId, int expectedVersion, String kind,
                                             int shortUnits, String note, boolean holdsVehicle) {
        var task = writable(user, id, expectedVersion, true);
        var line = line(task, lineId);
        if (!SHORTFALL_KINDS.contains(kind)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_KIND", "Choose missing, damaged or wrong item");
        if (shortUnits < 1 || shortUnits > line.units())
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SHORT_UNITS_INVALID",
                "Units short must be between 1 and the " + line.units() + " units on the manifest");
        if (tasks.issuesForTask(id).stream().anyMatch(i -> i.loadLineId() == lineId && "OPEN".equals(i.status())))
            throw new LoaderConflictException("ISSUE_ALREADY_OPEN", "A shortfall for this order is already with the dispatcher", Map.of("lineId", lineId));
        var now = clock.instant();
        tasks.recordLine(lineId, "short", line.units() - shortUnits, user.id(), now);
        long issue = tasks.insertIssue(task, lineId, line.orderId(), line.orderRef(), line.outletId(), kind, line.units(), shortUnits,
            note == null || note.isBlank() ? null : note.trim(), holdsVehicle, user.id(), user.displayName(), now);
        tasks.markStarted(id, user.id(), now);
        tasks.bumpVersion(id, expectedVersion, now);
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("orderRef", line.orderRef()); record.put("kind", kind); record.put("orderedUnits", line.units());
        record.put("shortUnits", shortUnits); record.put("holdsVehicle", holdsVehicle);
        audit.record("loading_issue.reported", user, "loading_issue", String.valueOf(issue), null, record, note);
        return detail(tasks.find(id, false).orElseThrow());
    }

    /** Every order counted, the manifest acknowledged and no hold: the trip goes to the driver. */
    @Transactional
    public LoaderViews.Detail markLoaded(CurrentUser user, long id, int expectedVersion) {
        var task = writable(user, id, expectedVersion, false);
        var blockers = blockers(task, tasks.issuesForTask(id));
        if (!blockers.isEmpty())
            throw new LoaderConflictException("HANDOVER_BLOCKED", "The trip cannot be handed over yet", Map.of("blockers", blockers));
        var now = clock.instant();
        tasks.markLoaded(id, user.id(), now);
        tasks.bumpVersion(id, expectedVersion, now);
        audit.record("load_task.loaded", user, "load_task", String.valueOf(id), null,
            Map.of("planVersion", task.planVersion(), "vehicleId", task.vehicleId(), "tripIndex", task.tripIndex(),
                "orders", task.lines().size()), null);
        return detail(tasks.find(id, false).orElseThrow());
    }

    @Transactional(readOnly = true)
    public List<LoadingIssue> issues(CurrentUser user, LocalDate date, String status) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        if (status != null && !List.of("OPEN", "RESOLVED").contains(status))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Use OPEN or RESOLVED");
        return tasks.issuesForRun(day, depot(user), status);
    }

    private LoaderViews.Detail detail(LoadTask task) {
        var issues = tasks.issuesForTask(task.id());
        var stops = LoaderViews.stops(task.lines(), outlet -> task.district());
        Integer replacedVersion = null;
        List<LoaderViews.ManifestChange> changes = List.of();
        if (task.replacesTaskId() != null) {
            var replaced = tasks.find(task.replacesTaskId(), false).orElseThrow();
            replacedVersion = replaced.planVersion();
            changes = changes(replaced, task);
        }
        Long current = null;
        if ("superseded".equals(task.status())) {
            Long cursor = task.id();
            while (cursor != null) {
                var next = tasks.replacedBy(cursor);
                if (next.isEmpty()) break;
                cursor = next.get();
                current = cursor;
            }
        }
        return new LoaderViews.Detail(task, card(task, issues), stops, replacedVersion, changes, issues, current,
            "superseded".equals(task.status()) || "loaded".equals(task.status()) ? List.of() : blockers(task, issues));
    }

    /** Per order: added, removed (take off the vehicle when it was loaded) or moved to another stop position. */
    private static List<LoaderViews.ManifestChange> changes(LoadTask replaced, LoadTask current) {
        Map<Long, LoadLine> before = new LinkedHashMap<>();
        replaced.lines().stream().sorted(java.util.Comparator.comparingInt(LoadLine::stopSeq)).forEach(l -> before.put(l.orderId(), l));
        Map<Long, LoadLine> after = new LinkedHashMap<>();
        current.lines().stream().sorted(java.util.Comparator.comparingInt(LoadLine::stopSeq)).forEach(l -> after.put(l.orderId(), l));
        List<LoaderViews.ManifestChange> result = new ArrayList<>();
        after.forEach((orderId, line) -> {
            var old = before.get(orderId);
            if (old == null) result.add(new LoaderViews.ManifestChange(line.orderRef(), line.outletId(), "ADDED", null, line.stopSeq(), null));
            else if (old.stopSeq() != line.stopSeq())
                result.add(new LoaderViews.ManifestChange(line.orderRef(), line.outletId(), "RESEQUENCED", old.stopSeq(), line.stopSeq(), line.loadedUnits()));
        });
        before.forEach((orderId, old) -> {
            if (!after.containsKey(orderId))
                result.add(new LoaderViews.ManifestChange(old.orderRef(), old.outletId(), "REMOVED", old.stopSeq(), null, old.loadedUnits()));
        });
        return result;
    }

    private static List<String> blockers(LoadTask task, List<LoadingIssue> issues) {
        List<String> result = new ArrayList<>();
        if (task.awaitingAcknowledgement()) result.add("Acknowledge manifest v" + task.planVersion() + " first");
        long pending = task.lines().stream().filter(l -> "pending".equals(l.status())).count();
        if (pending > 0) result.add(pending + (pending == 1 ? " order is" : " orders are") + " not counted yet");
        long holds = issues.stream().filter(i -> "OPEN".equals(i.status()) && i.holdsVehicle()).count();
        if (holds > 0) result.add("The vehicle is held until the dispatcher decides on " + holds + (holds == 1 ? " shortfall" : " shortfalls"));
        return result;
    }

    private static LoaderViews.TripCard card(LoadTask t, List<LoadingIssue> issues) {
        var stops = LoaderViews.stops(t.lines(), outlet -> t.district());
        var open = issues.stream().filter(i -> "OPEN".equals(i.status())).toList();
        return new LoaderViews.TripCard(t.id(), t.vehicleId(), t.tripIndex(), t.brand(), t.district(), t.plannedDepart(), t.planVersion(),
            t.status(), t.driverName(), stops.size(), t.lines().size(),
            (int) t.lines().stream().filter(l -> !"pending".equals(l.status())).count(),
            (int) stops.stream().filter(s -> "loaded".equals(s.status())).count(),
            t.lines().stream().map(LoadLine::volumeM3).reduce(BigDecimal.ZERO, BigDecimal::add), t.volumeCapM3(),
            t.lines().stream().map(LoadLine::weightKg).reduce(BigDecimal.ZERO, BigDecimal::add), t.weightCapKg(),
            open.stream().anyMatch(LoadingIssue::holdsVehicle), t.awaitingAcknowledgement(), open.size());
    }

    private LoadTask writable(CurrentUser user, long id, int expectedVersion, boolean counting) {
        var task = load(user, id, true);
        if ("superseded".equals(task.status())) {
            Map<String, Object> props = new HashMap<>();
            tasks.replacedBy(id).ifPresent(next -> props.put("currentTaskId", next));
            throw new LoaderConflictException("MANIFEST_SUPERSEDED", "A newer manifest replaced this one; open the current manifest", props);
        }
        if (task.version() != expectedVersion)
            throw new LoaderConflictException("STALE_LOAD_TASK", "The manifest changed on another device; reload it", Map.of("version", task.version()));
        if ("loaded".equals(task.status()))
            throw new LoaderConflictException("TRIP_ALREADY_LOADED", "This trip was already handed over", Map.of());
        if (counting && task.awaitingAcknowledgement())
            throw new LoaderConflictException("MANIFEST_NOT_ACKNOWLEDGED", "Acknowledge manifest v" + task.planVersion() + " before loading",
                Map.of("planVersion", task.planVersion()));
        return task;
    }

    private LoadTask load(CurrentUser user, long id, boolean lock) {
        var task = tasks.find(id, lock).orElseThrow(LoaderService::missing);
        if (!user.canAccessDepot(task.depot())) throw missing();
        return task;
    }

    private static LoadLine line(LoadTask task, long lineId) {
        return task.lines().stream().filter(l -> l.id() == lineId).findFirst().orElseThrow(LoaderService::missing);
    }

    private static String depot(CurrentUser user) {
        if (user.depot() == null) throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "This loader account has no depot");
        return user.depot();
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
}
