package lk.techtrithalon.waypoint.receipt.application;

import java.time.Clock;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.delivery.application.DeliveryReadService;
import lk.techtrithalon.waypoint.delivery.domain.DeliveredOrder;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.ordering.application.OrderCommandService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.application.PublishedRouteService;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.Outlet;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The store manager's side of delivery: see deliveries to the outlet, and confirm or dispute what the
 * driver recorded, once per order. A dispute opens a discrepancy for the dispatcher, who resolves it.
 * Everything is scoped to the signed-in store's own outlet (another outlet's order is 404).
 *
 * <p>Final status: a confirmed receipt, or a resolved dispute, moves the order to receipt_confirmed.
 * An open dispute leaves it delivered or partial.
 */
@Service
public class ReceiptService {
    private static final String LISTED = "planned,loaded,in_transit,delivered,partial,failed,receipt_confirmed";
    public static final List<String> DISPUTE_KINDS = List.of("SHORT", "DAMAGED", "WRONG_ITEM", "OTHER");
    public static final List<String> DECISIONS = List.of("CREDIT", "REPLACEMENT", "NO_ACTION");

    private final ReceiptRepository receipts;
    private final OrderQueryService orderQueries;
    private final OrderCommandService orderCommands;
    private final LoadTaskService loadTasks;
    private final DeliveryReadService deliveryReads;
    private final PublishedRouteService routes;
    private final ReferenceService reference;
    private final AuditService audit;
    private final Clock clock;

    public ReceiptService(ReceiptRepository receipts, OrderQueryService orderQueries, OrderCommandService orderCommands, LoadTaskService loadTasks,
                          DeliveryReadService deliveryReads, PublishedRouteService routes, ReferenceService reference, AuditService audit, Clock clock) {
        this.receipts = receipts; this.orderQueries = orderQueries; this.orderCommands = orderCommands; this.loadTasks = loadTasks;
        this.deliveryReads = deliveryReads; this.routes = routes; this.reference = reference; this.audit = audit; this.clock = clock;
    }

    /** What the loaded view of one order needs, gathered once. */
    private record Facts(CustomerOrder order, Optional<LoadTask> task, Optional<DeliveredOrder> record, Optional<ReceiptViews.Receipt> receipt,
                         Optional<ReceiptViews.Discrepancy> discrepancy) {}

    // ---------------------------------------------------------------- store reads

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public ReceiptViews.DeliveryList deliveries(CurrentUser user, String phase) {
        var orders = orderQueries.storeOrders(user, null, LISTED, null, "orderDate", false, 0, 200).items();
        var facts = facts(user, orders);
        var outlet = reference.outlet(user, user.outletId());
        List<ReceiptViews.DeliveryRow> rows = new ArrayList<>();
        for (var f : facts) {
            var row = row(f, outlet);
            if (phase == null || phase.isBlank() || phase.equals(row.phase())) rows.add(row);
        }
        return new ReceiptViews.DeliveryList(user.outletId(), rows);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public ReceiptViews.DeliveryDetail delivery(CurrentUser user, long orderId) {
        var order = orderQueries.storeOrder(user, orderId);
        if (!LISTED.contains(order.status())) throw notFound();
        var f = facts(user, List.of(order)).getFirst();
        var outlet = reference.outlet(user, user.outletId());
        var row = row(f, outlet);
        var record = f.record();
        String blocker = blocker(f);
        List<ReceiptViews.Event> timeline = new ArrayList<>();
        timeline.add(new ReceiptViews.Event("Order placed", order.placedAt()));
        f.task().ifPresent(t -> { if (t.loadedAt() != null) timeline.add(new ReceiptViews.Event("Loaded and dispatched", t.loadedAt())); });
        record.ifPresent(r -> timeline.add(new ReceiptViews.Event(switch (r.outcome()) {
            case "DELIVERED" -> "Delivered";
            case "PARTIAL" -> "Partially delivered";
            default -> "Delivery failed";
        }, r.occurredAt())));
        f.receipt().ifPresent(r -> timeline.add(new ReceiptViews.Event("DISPUTED".equals(r.outcome()) ? "Issue reported" : "Receipt confirmed", r.confirmedAt())));
        f.discrepancy().ifPresent(d -> { if (d.resolvedAt() != null) timeline.add(new ReceiptViews.Event("Issue resolved by the dispatcher", d.resolvedAt())); });
        timeline.removeIf(e -> e.at() == null);
        return new ReceiptViews.DeliveryDetail(row, order.outletId(), order.district(), order.brand(), outlet.dockType(), outlet.parkingConstraint(),
            order.status(), record.map(DeliveredOrder::loadedUnits).orElse(order.units()), record.map(DeliveredOrder::issueKind).orElse(null),
            record.map(DeliveredOrder::recipientName).orElse(null), record.map(DeliveredOrder::photos).orElse(0), record.map(DeliveredOrder::signatures).orElse(0),
            f.receipt().orElse(null), f.discrepancy().orElse(null), blocker == null, blocker, timeline);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public List<ReceiptViews.Discrepancy> issues(CurrentUser user, String status) {
        checkStatus(status);
        if (user.outletId() == null) throw notFound();
        return receipts.discrepanciesForOutlet(user.outletId(), blankToNull(status));
    }

    // ---------------------------------------------------------------- store actions

    /** The store checked the delivery and it matches what the driver recorded. */
    @Transactional
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public ReceiptViews.DeliveryDetail confirm(CurrentUser user, long orderId) {
        var f = writable(user, orderId);
        var record = f.record().orElseThrow();
        long id = insert(() -> receipts.insertReceipt(orderId, record.recordId(), f.order().outletId(), "CONFIRMED", record.deliveredUnits(), null, null, null,
            user.id(), user.displayName(), clock.instant()), f);
        orderCommands.markReceiptConfirmed(user, orderId, null);
        audit.record("receipt.confirmed", user, "receipt", String.valueOf(id), null,
            Map.of("orderId", orderId, "deliveredUnits", record.deliveredUnits()), null);
        return delivery(user, orderId);
    }

    /** The store found a difference: short, damaged, wrong item or something else. The dispatcher is told. */
    @Transactional
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public ReceiptViews.DeliveryDetail dispute(CurrentUser user, long orderId, String kind, int affectedUnits, String note) {
        if (!DISPUTE_KINDS.contains(kind)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_KIND", "Use SHORT, DAMAGED, WRONG_ITEM or OTHER");
        var f = writable(user, orderId);
        var record = f.record().orElseThrow();
        if (affectedUnits < 1 || affectedUnits > record.deliveredUnits())
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "AFFECTED_UNITS_INVALID", "Units affected must be between 1 and " + record.deliveredUnits());
        String text = note == null || note.isBlank() ? null : note.trim();
        if ("OTHER".equals(kind) && text == null)
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NOTE_REQUIRED", "Describe what is wrong");
        var now = clock.instant();
        var task = f.task();
        long receiptId = insert(() -> receipts.insertReceipt(orderId, record.recordId(), f.order().outletId(), "DISPUTED", record.deliveredUnits(), kind,
            affectedUnits, text, user.id(), user.displayName(), now), f);
        long id = receipts.insertDiscrepancy(receiptId, orderId, f.order().ref(), f.order().outletId(), f.order().depot(), record.deliveredUnits(), kind,
            affectedUnits, text, task.map(LoadTask::vehicleId).orElse(null), task.map(LoadTask::driverName).orElse(null), record.occurredAt(),
            user.id(), user.displayName(), now);
        audit.record("receipt.disputed", user, "receipt_discrepancy", String.valueOf(id), null,
            Map.of("orderId", orderId, "kind", kind, "affectedUnits", affectedUnits, "deliveredUnits", record.deliveredUnits()), text);
        return delivery(user, orderId);
    }

    // ---------------------------------------------------------------- dispatcher

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<ReceiptViews.Discrepancy> discrepancies(CurrentUser user, String depot, String status) {
        checkStatus(status);
        String scope = depot != null && !depot.isBlank() ? depot : user.depot();
        if (depot != null && !depot.isBlank() && !user.canAccessDepot(depot)) return List.of();
        return receipts.discrepanciesForDepot(scope, blankToNull(status));
    }

    /** The dispatcher decides what happens to a disputed delivery. The order then counts as received. */
    @Transactional
    @PreAuthorize("hasRole('DISPATCHER')")
    public ReceiptViews.Discrepancy resolve(CurrentUser user, long id, int expectedVersion, String decision, String note) {
        if (!DECISIONS.contains(decision)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DECISION", "Use CREDIT, REPLACEMENT or NO_ACTION");
        var d = receipts.findDiscrepancy(id, true).orElseThrow(ReceiptService::notFound);
        if (!user.canAccessDepot(d.depot())) throw notFound();
        if ("RESOLVED".equals(d.status())) throw new ApiException(HttpStatus.CONFLICT, "DISCREPANCY_RESOLVED", "This issue was already resolved");
        if (d.version() != expectedVersion) throw new ApiException(HttpStatus.CONFLICT, "STALE_DISCREPANCY", "The issue changed; reload it");
        if (note == null || note.isBlank()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NOTE_REQUIRED", "Write what you decided and why");
        if (!receipts.resolve(id, expectedVersion, decision, note.trim(), user.id(), user.displayName(), clock.instant()))
            throw new ApiException(HttpStatus.CONFLICT, "STALE_DISCREPANCY", "The issue changed; reload it");
        orderCommands.markReceiptConfirmed(user, d.orderId(), note.trim());
        audit.record("receipt.discrepancy_resolved", user, "receipt_discrepancy", String.valueOf(id), Map.of("status", "OPEN"),
            Map.of("status", "RESOLVED", "decision", decision), note.trim());
        return receipts.findDiscrepancy(id, false).orElseThrow();
    }

    // ---------------------------------------------------------------- assembly

    private Facts writable(CurrentUser user, long orderId) {
        var order = orderQueries.storeOrder(user, orderId);
        if (!LISTED.contains(order.status())) throw notFound();
        var f = facts(user, List.of(order)).getFirst();
        if (f.receipt().isPresent())
            throw new ReceiptConflictException("RECEIPT_ALREADY_RECORDED", "A receipt was already recorded for this order",
                Map.of("outcome", f.receipt().get().outcome()));
        String blocker = blocker(f);
        if (blocker != null) throw new ReceiptConflictException(f.record().isEmpty() ? "NOT_DELIVERED_YET" : "NOTHING_DELIVERED", blocker, Map.of());
        return f;
    }

    private long insert(java.util.function.LongSupplier insert, Facts f) {
        try { return insert.getAsLong(); }
        catch (DuplicateKeyException e) {
            throw new ReceiptConflictException("RECEIPT_ALREADY_RECORDED", "A receipt was already recorded for this order", Map.of());
        }
    }

    private static String blocker(Facts f) {
        if (f.receipt().isPresent()) return "A receipt is already recorded for this order.";
        var record = f.record();
        if (record.isEmpty()) return "The driver has not delivered this order yet.";
        if ("FAILED".equals(record.get().outcome())) return "This order was not delivered, so there is nothing to confirm.";
        return null;
    }

    private List<Facts> facts(CurrentUser user, List<CustomerOrder> orders) {
        var ids = orders.stream().map(CustomerOrder::id).toList();
        Map<Long, LoadTask> tasks = new HashMap<>();
        for (var task : loadTasks.currentForOrders(user, ids))
            for (LoadLine line : task.lines()) tasks.putIfAbsent(line.orderId(), task);
        Map<Long, DeliveredOrder> records = new HashMap<>();
        deliveryReads.forOrders(user, ids).forEach(r -> records.put(r.orderId(), r));
        Map<Long, ReceiptViews.Receipt> confirmations = new HashMap<>();
        receipts.receiptsForOrders(ids).forEach(r -> confirmations.put(r.orderId(), r));
        Map<Long, ReceiptViews.Discrepancy> discrepancies = new HashMap<>();
        receipts.discrepanciesForOrders(ids).forEach(d -> discrepancies.put(d.orderId(), d));
        return orders.stream().map(o -> new Facts(o, Optional.ofNullable(tasks.get(o.id())), Optional.ofNullable(records.get(o.id())),
            Optional.ofNullable(confirmations.get(o.id())), Optional.ofNullable(discrepancies.get(o.id())))).toList();
    }

    private ReceiptViews.DeliveryRow row(Facts f, Outlet outlet) {
        var o = f.order();
        String phase = switch (o.status()) {
            case "planned", "loaded" -> "PENDING";
            case "in_transit" -> "IN_DELIVERY";
            default -> "DELIVERED";
        };
        String receipt = f.receipt().map(r -> "CONFIRMED".equals(r.outcome()) ? "CONFIRMED"
            : f.discrepancy().map(d -> "RESOLVED".equals(d.status()) ? "RESOLVED" : "DISPUTED").orElse("DISPUTED")).orElse("NONE");
        var task = f.task();
        LocalTime planned = null;
        if (!"DELIVERED".equals(phase) && task.isPresent()) {
            var t = task.get();
            planned = routes.current(t.planDate(), t.depot(), t.vehicleId(), t.tripIndex())
                .flatMap(r -> r.stops().stream().filter(s -> s.orderId() == o.id()).findFirst()).map(s -> s.plannedArrival()).orElse(null);
        }
        var record = f.record();
        return new ReceiptViews.DeliveryRow(o.id(), o.ref(), task.map(LoadTask::planDate).orElse(o.planningDate()), phase, receipt, o.tempRequirement(), o.units(),
            outlet.effectiveWindowOpen(), outlet.effectiveWindowClose(), task.map(LoadTask::driverName).orElse(null), task.map(LoadTask::vehicleId).orElse(null),
            task.map(LoadTask::tripIndex).orElse(null), planned, record.map(DeliveredOrder::outcome).orElse(null),
            record.map(DeliveredOrder::deliveredUnits).orElse(null), record.map(DeliveredOrder::occurredAt).orElse(null));
    }

    private static void checkStatus(String status) {
        if (status != null && !status.isBlank() && !List.of("OPEN", "RESOLVED").contains(status))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Use OPEN or RESOLVED");
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }

    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
}
