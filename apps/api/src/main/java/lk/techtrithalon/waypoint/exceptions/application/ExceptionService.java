package lk.techtrithalon.waypoint.exceptions.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.delivery.application.DeliveryReadService;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryProblem;
import lk.techtrithalon.waypoint.exceptions.domain.ExceptionViews;
import lk.techtrithalon.waypoint.exceptions.domain.OperationalException;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.loading.application.LoadingIssueService;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import lk.techtrithalon.waypoint.receipt.application.ReceiptService;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import lk.techtrithalon.waypoint.sync.application.SyncReviewService;
import lk.techtrithalon.waypoint.sync.domain.SyncReview;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One queue for everything that needs the dispatcher after planning. It is a read model: loading
 * shortfalls, store disputes, driver problems and offline review flags stay with the modules that own
 * them, and are joined here with the dispatcher's own handling state (who took it, how it was closed).
 * Loading and receipt items are decided through their owners; the others are closed by acknowledging
 * them with a note.
 *
 * <p>Scope: the run's own problems for the chosen day and depot, plus store disputes of the depot on
 * any day (a dispute may arrive after the delivery day).
 */
@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class ExceptionService {
    private final LoadingIssueService loadingIssues;
    private final ReceiptService receipts;
    private final DeliveryReadService deliveries;
    private final SyncReviewService syncReviews;
    private final LoadTaskService loadTasks;
    private final ExceptionRepository states;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final AuditService audit;
    private final Clock clock;

    public ExceptionService(LoadingIssueService loadingIssues, ReceiptService receipts, DeliveryReadService deliveries, SyncReviewService syncReviews,
                            LoadTaskService loadTasks, ExceptionRepository states, ReferenceService reference, ReferenceProperties referenceProperties,
                            AuditService audit, Clock clock) {
        this.loadingIssues = loadingIssues; this.receipts = receipts; this.deliveries = deliveries; this.syncReviews = syncReviews;
        this.loadTasks = loadTasks; this.states = states; this.reference = reference; this.referenceProperties = referenceProperties;
        this.audit = audit; this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ExceptionViews.Queue queue(CurrentUser user, LocalDate date, String depot) {
        LocalDate day = day(date);
        String selected = depot(user, depot);
        var items = items(user, day, selected);
        return new ExceptionViews.Queue(day, selected, clock.instant(), counts(items), items);
    }

    /** Unresolved and total counts for the dashboard and the sidebar; every depot when none is given. */
    @Transactional(readOnly = true)
    public ExceptionViews.Counts counts(CurrentUser user, LocalDate date, String depot) {
        LocalDate day = day(date);
        if (depot != null && !depot.isBlank()) return counts(items(user, day, depot(user, depot)));
        var total = ExceptionViews.Counts.NONE;
        for (String d : reference.depots(user)) total = total.plus(counts(items(user, day, d)));
        return total;
    }

    /** The dispatcher takes an item: it moves to In Progress under their name. Taking over from a colleague is allowed. */
    @Transactional
    public ExceptionViews.Item claim(CurrentUser user, LocalDate date, String depot, String type, String id) {
        var item = find(user, day(date), depot(user, depot), type, id);
        if ("RESOLVED".equals(item.status())) throw resolved();
        if (!states.claim(type, id, user.id(), user.displayName(), clock.instant())) throw resolved();
        audit.record("exception.claimed", user, "operational_exception", stateId(type, id), Map.of("status", item.status()),
            Map.of("sourceType", type, "sourceId", id, "status", "IN_PROGRESS", "owner", user.displayName()), null);
        return find(user, day(date), depot(user, depot), type, id);
    }

    /**
     * Closes an item. Loading shortfalls and store disputes need a decision and are closed by their owning
     * module; everything else is acknowledged. A note is always required.
     */
    @Transactional
    public ExceptionViews.Item resolve(CurrentUser user, LocalDate date, String depot, String type, String id, int expectedVersion,
                                       String decision, String note) {
        LocalDate day = day(date);
        String selected = depot(user, depot);
        var item = find(user, day, selected, type, id);
        if ("RESOLVED".equals(item.status())) throw resolved();
        if (note == null || note.isBlank()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NOTE_REQUIRED", "Write what you decided and why");
        String text = note.trim();
        var now = clock.instant();
        if (!item.decisions().isEmpty()) {
            if (decision == null || !item.decisions().contains(decision))
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DECISION", "Use " + String.join(", ", item.decisions()));
            long sourceId = Long.parseLong(id);
            switch (type) {
                case "LOADING_ISSUE" -> loadingIssues.resolve(user, sourceId, expectedVersion, decision, text);
                default -> receipts.resolve(user, sourceId, expectedVersion, decision, text);
            }
            states.markResolved(type, id, user.id(), user.displayName(), text, now);
        } else {
            if (item.version() != expectedVersion || !states.resolve(type, id, expectedVersion, user.id(), user.displayName(), text, now))
                throw new ApiException(HttpStatus.CONFLICT, "STALE_EXCEPTION", "This item changed; reload it");
        }
        audit.record("exception.resolved", user, "operational_exception", stateId(type, id), Map.of("status", item.status()),
            decision == null ? Map.of("sourceType", type, "sourceId", id, "status", "RESOLVED")
                : Map.of("sourceType", type, "sourceId", id, "status", "RESOLVED", "decision", decision), text);
        return find(user, day, selected, type, id);
    }

    // ---------------------------------------------------------------- assembly

    private ExceptionViews.Item find(CurrentUser user, LocalDate day, String depot, String type, String id) {
        if (!ExceptionViews.TYPES.contains(type)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TYPE", "Unknown exception type");
        return items(user, day, depot).stream().filter(i -> i.sourceType().equals(type) && i.sourceId().equals(id)).findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"));
    }

    private List<ExceptionViews.Item> items(CurrentUser user, LocalDate day, String depot) {
        var tasks = loadTasks.currentForRun(user, day, depot);
        Map<String, LoadTask> byDriverTrip = new HashMap<>();
        Map<Long, String> driverNames = new HashMap<>();
        for (var t : tasks) {
            if (t.driverUserId() == null) continue;
            byDriverTrip.put(t.driverUserId() + "#" + t.tripIndex(), t);
            driverNames.put(t.driverUserId(), t.driverName());
        }
        var loading = loadingIssues.forRun(user, day, depot, null);
        var receipt = receipts.discrepancies(user, depot, null);
        var delivery = deliveries.problemsForRun(user, day, depot);
        var sync = syncReviews.forDrivers(user, day, driverNames.keySet());

        List<ExceptionViews.Item> items = new ArrayList<>();
        var loadingStates = state("LOADING_ISSUE", loading.stream().map(i -> String.valueOf(i.id())).toList());
        loading.forEach(i -> items.add(loadingItem(i, loadingStates.get(String.valueOf(i.id())))));
        var receiptStates = state("RECEIPT_DISCREPANCY", receipt.stream().map(d -> String.valueOf(d.id())).toList());
        receipt.forEach(d -> items.add(receiptItem(d, receiptStates.get(String.valueOf(d.id())))));
        var deliveryStates = state("DELIVERY_PROBLEM", delivery.stream().map(p -> String.valueOf(p.recordId())).toList());
        delivery.forEach(p -> items.add(deliveryItem(p, deliveryStates.get(String.valueOf(p.recordId())))));
        var syncStates = state("SYNC_REVIEW", sync.stream().map(s -> s.clientActionId().toString()).toList());
        sync.forEach(s -> items.add(syncItem(s, syncStates.get(s.clientActionId().toString()), byDriverTrip.get(s.userId() + "#" + s.tripIndex()),
            driverNames.get(s.userId()))));
        items.sort(Comparator.comparing((ExceptionViews.Item i) -> "RESOLVED".equals(i.status()))
            .thenComparing(ExceptionViews.Item::reportedAt, Comparator.reverseOrder()).thenComparing(ExceptionViews.Item::id));
        return items;
    }

    /** The audit trail refers to the state row (a source id such as a sync action's UUID would not fit). */
    private String stateId(String type, String id) {
        return String.valueOf(states.find(type, List.of(id)).getFirst().id());
    }

    private Map<String, OperationalException> state(String type, List<String> ids) {
        return states.find(type, ids).stream().collect(Collectors.toMap(OperationalException::sourceId, Function.identity()));
    }

    private static ExceptionViews.Item loadingItem(LoadingIssue i, OperationalException s) {
        boolean resolved = "RESOLVED".equals(i.status());
        String detail = i.shortUnits() + " of " + i.orderedUnits() + " units " + i.kind().toLowerCase().replace('_', ' ')
            + (i.holdsVehicle() && !resolved ? " · vehicle held" : "") + (i.note() == null || i.note().isBlank() ? "" : " · " + i.note());
        return new ExceptionViews.Item("LOADING_ISSUE:" + i.id(), "LOADING_ISSUE", String.valueOf(i.id()), "LOADING_SHORTFALL",
            "Loading shortfall: " + i.orderRef(), detail, i.orderRef(), i.outletId(), i.vehicleId(), i.tripIndex(), null, i.planDate(),
            i.reportedByName(), i.reportedAt(), status(resolved, s), owner(s), s == null ? null : s.claimedAt(), LoadingIssueService.DECISIONS,
            i.decision(), i.decisionNote(), i.resolvedByName(), i.resolvedAt(), i.version());
    }

    private static ExceptionViews.Item receiptItem(ReceiptViews.Discrepancy d, OperationalException s) {
        boolean resolved = "RESOLVED".equals(d.status());
        String detail = d.kind().toLowerCase().replace('_', ' ') + " · " + d.affectedUnits() + " of " + d.deliveredUnits() + " units"
            + (d.note() == null || d.note().isBlank() ? "" : " · " + d.note());
        return new ExceptionViews.Item("RECEIPT_DISCREPANCY:" + d.id(), "RECEIPT_DISCREPANCY", String.valueOf(d.id()), "RECEIPT_DISPUTE",
            "Store dispute: " + d.orderRef(), detail, d.orderRef(), d.outletId(), d.vehicleId(), null, d.driverName(), null,
            d.reportedByName(), d.reportedAt(), status(resolved, s), owner(s), s == null ? null : s.claimedAt(), ReceiptService.DECISIONS,
            d.decision(), d.decisionNote(), d.resolvedByName(), d.resolvedAt(), d.version());
    }

    private static ExceptionViews.Item deliveryItem(DeliveryProblem p, OperationalException s) {
        boolean resolved = s != null && "RESOLVED".equals(s.status());
        String kind = switch (p.outcome()) { case "PARTIAL" -> "DELIVERY_PARTIAL"; case "FAILED" -> "DELIVERY_FAILED"; default -> "DELIVERY_REVIEW"; };
        String title = switch (kind) {
            case "DELIVERY_PARTIAL" -> "Partial delivery: " + p.orderRef();
            case "DELIVERY_FAILED" -> "Delivery failed: " + p.orderRef();
            default -> "Delivery needs review: " + p.orderRef();
        };
        var detail = new StringBuilder();
        if (!"FAILED".equals(p.outcome())) detail.append(p.deliveredUnits()).append(" of ").append(p.loadedUnits()).append(" units delivered");
        if (p.issueKind() != null) detail.append(detail.isEmpty() ? "" : " · ").append(p.issueKind().toLowerCase().replace('_', ' '));
        if (p.reviewReason() != null) detail.append(detail.isEmpty() ? "" : " · ").append(reason(p.reviewReason()));
        if (p.notes() != null && !p.notes().isBlank()) detail.append(detail.isEmpty() ? "" : " · ").append(p.notes());
        return new ExceptionViews.Item("DELIVERY_PROBLEM:" + p.recordId(), "DELIVERY_PROBLEM", String.valueOf(p.recordId()), kind, title,
            detail.toString(), p.orderRef(), p.outletId(), p.vehicleId(), p.tripIndex(), p.driverName(), p.planDate(),
            p.driverName(), p.recordedAt(), status(resolved, s), owner(s), s == null ? null : s.claimedAt(), List.of(),
            null, s == null ? null : s.note(), s == null ? null : s.resolvedByName(), s == null ? null : s.resolvedAt(), s == null ? 0 : s.version());
    }

    private static ExceptionViews.Item syncItem(SyncReview r, OperationalException s, LoadTask task, String driver) {
        boolean resolved = s != null && "RESOLVED".equals(s.status());
        String kind = "CONFLICT".equals(r.result()) ? "SYNC_CONFLICT" : "REJECTED".equals(r.result()) ? "SYNC_REJECTED" : r.review();
        String title = switch (kind) {
            case "SYNC_CONFLICT" -> "Phone action conflicted";
            case "SYNC_REJECTED" -> "Phone action rejected";
            case "ROUTE_CHANGED_OFFLINE" -> "Trip started on an older route";
            default -> "Stop no longer on the trip";
        };
        var detail = new StringBuilder(action(r.actionType()));
        if ("SYNC_CONFLICT".equals(kind) || "SYNC_REJECTED".equals(kind)) {
            if (r.message() != null) detail.append(" · ").append(r.message());
            else if (r.code() != null) detail.append(" · ").append(r.code().toLowerCase().replace('_', ' '));
        } else detail.append(" · ").append(reason(r.review()));
        if (r.clockSkew()) detail.append(" · device clock was off");
        return new ExceptionViews.Item("SYNC_REVIEW:" + r.clientActionId(), "SYNC_REVIEW", r.clientActionId().toString(), kind, title, detail.toString(),
            null, r.entityId() != null && !r.entityId().chars().allMatch(Character::isDigit) ? r.entityId() : null,
            task == null ? null : task.vehicleId(), r.tripIndex(), driver, r.planDate(), driver, r.receivedAt(),
            status(resolved, s), owner(s), s == null ? null : s.claimedAt(), List.of(),
            null, s == null ? null : s.note(), s == null ? null : s.resolvedByName(), s == null ? null : s.resolvedAt(), s == null ? 0 : s.version());
    }

    private static String status(boolean resolved, OperationalException s) {
        if (resolved) return "RESOLVED";
        return s != null && "IN_PROGRESS".equals(s.status()) ? "IN_PROGRESS" : "OPEN";
    }

    private static String owner(OperationalException s) { return s == null || !"IN_PROGRESS".equals(s.status()) ? null : s.claimedByName(); }

    private static String reason(String review) {
        return switch (review) {
            case "ORDER_NOT_ON_TRIP" -> "order was moved off the trip while the phone was offline";
            case "PROOF_MISSING" -> "proof did not arrive";
            case "ROUTE_CHANGED_OFFLINE" -> "route changed while the phone was offline";
            case "STOP_NOT_ON_TRIP" -> "stop was moved off the trip";
            default -> review.toLowerCase().replace('_', ' ');
        };
    }

    private static String action(String type) {
        return switch (type) {
            case "TRIP_START" -> "Start trip";
            case "STOP_ARRIVE" -> "Arrive at stop";
            case "ORDER_OUTCOME" -> "Record delivery";
            case "STOP_DEPART" -> "Leave stop";
            default -> "Finish trip";
        };
    }

    private static ExceptionViews.Counts counts(List<ExceptionViews.Item> items) {
        int open = 0, progress = 0, resolved = 0;
        for (var i : items) {
            switch (i.status()) { case "RESOLVED" -> resolved++; case "IN_PROGRESS" -> progress++; default -> open++; }
        }
        return new ExceptionViews.Counts(items.size(), open, progress, resolved);
    }

    private LocalDate day(LocalDate date) { return date == null ? referenceProperties.demoOperatingDate() : date; }

    private static String depot(CurrentUser user, String depot) {
        String selected = depot == null || depot.isBlank() ? user.depot() : depot;
        if (selected == null) throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED", "Choose a depot");
        if (!user.canAccessDepot(selected)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        return selected;
    }

    private static ApiException resolved() { return new ApiException(HttpStatus.CONFLICT, "EXCEPTION_RESOLVED", "This item was already resolved"); }
}
