package lk.techtrithalon.waypoint.delivery.application;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryRecord;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryTrip;
import lk.techtrithalon.waypoint.delivery.domain.DriverViews;
import lk.techtrithalon.waypoint.delivery.domain.PodAsset;
import lk.techtrithalon.waypoint.delivery.domain.StopVisit;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.ordering.application.OrderCommandService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.OrderStatus;
import lk.techtrithalon.waypoint.planning.application.PublishedRouteService;
import lk.techtrithalon.waypoint.planning.domain.PublishedRoute;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import lk.techtrithalon.waypoint.shared.time.TimeConfiguration;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The driver's workflow on the trips published to them: start a handed-over trip, arrive at each
 * stop, record every order's outcome with proof, leave the stop and finish the trip. A trip is
 * addressed by its slot (1 or 2) on the day, which stays the same when the dispatcher republishes;
 * stops and times are always read from the current published version.
 */
@Service
@PreAuthorize("hasRole('DRIVER')")
public class DriverService {
    private final DeliveryRepository deliveries;
    private final LoadTaskService loadTasks;
    private final PublishedRouteService routes;
    private final OrderCommandService orderCommands;
    private final OrderQueryService orderQueries;
    private final PodStorage storage;
    private final AuditService audit;
    private final Clock clock;
    private final ReferenceProperties referenceProperties;

    public DriverService(DeliveryRepository deliveries, LoadTaskService loadTasks, PublishedRouteService routes,
                         OrderCommandService orderCommands, OrderQueryService orderQueries, PodStorage storage,
                         AuditService audit, Clock clock, ReferenceProperties referenceProperties) {
        this.deliveries = deliveries; this.loadTasks = loadTasks; this.routes = routes; this.orderCommands = orderCommands;
        this.orderQueries = orderQueries; this.storage = storage; this.audit = audit; this.clock = clock;
        this.referenceProperties = referenceProperties;
    }

    /** Everything one trip slot needs: the current manifest and route, and what happened on the road. */
    private record Slot(LoadTask task, PublishedRoute route, Optional<DeliveryTrip> trip, List<StopVisit> visits,
                        List<DeliveryRecord> records, List<PodAsset> assets) {}

    /** A stop as the driver sees it: consecutive orders for one outlet. */
    private record StopGroup(int seq, String outletId, List<LoadLine> lines) {}

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public DriverViews.Home home(CurrentUser user, LocalDate date) {
        LocalDate day = day(date);
        var slots = slots(user, day);
        var cards = slots.stream().map(this::card).toList();
        int stops = cards.stream().mapToInt(DriverViews.TripCard::stops).sum();
        int stopsDone = cards.stream().mapToInt(DriverViews.TripCard::stopsDone).sum();
        int orders = cards.stream().mapToInt(DriverViews.TripCard::orders).sum();
        int ordersDone = cards.stream().mapToInt(DriverViews.TripCard::ordersDone).sum();
        var current = cards.stream().filter(c -> !"COMPLETED".equals(c.state())).findFirst().orElse(null);
        return new DriverViews.Home(day, cards.isEmpty() ? null : cards.getFirst().vehicleId(),
            new DriverViews.Progress(stops, stopsDone, orders, ordersDone), cards, current);
    }

    @Transactional(readOnly = true)
    public DriverViews.TripDetail trip(CurrentUser user, int tripIndex, LocalDate date) {
        return detail(user, slot(user, day(date), tripIndex));
    }

    @Transactional(readOnly = true)
    public DriverViews.Deliveries deliveries(CurrentUser user, LocalDate date) {
        LocalDate day = day(date);
        List<DriverViews.DeliveryRow> rows = new ArrayList<>();
        for (var slot : slots(user, day)) {
            var detail = detail(user, slot);
            for (var stop : detail.stops()) {
                boolean issue = stop.orders().stream().anyMatch(o -> o.outcome() != null && !"DELIVERED".equals(o.outcome().outcome()));
                String status = switch (stop.status()) {
                    case "COMPLETED" -> issue ? "ISSUE" : "DELIVERED";
                    case "ARRIVED" -> "IN_PROGRESS";
                    default -> detail.currentStopSeq() != null && detail.currentStopSeq() == stop.seq() ? "IN_PROGRESS" : "PENDING";
                };
                rows.add(new DriverViews.DeliveryRow(slot.task().tripIndex(), stop.seq(), stop.outletId(), stop.district(),
                    stop.orders().size(), stop.units(), stop.weightKg(), status, stop.departedAt(),
                    stop.eta() != null ? stop.eta() : stop.plannedArrival(), stop.orders().stream().map(DriverViews.Order::orderRef).toList()));
            }
        }
        return new DriverViews.Deliveries(day, rows);
    }

    @Transactional(readOnly = true)
    public List<DriverViews.PastTrip> pastTrips(CurrentUser user, LocalDate before) {
        List<DriverViews.PastTrip> result = new ArrayList<>();
        for (var trip : deliveries.pastTrips(user.id(), day(before), 30)) {
            var records = deliveries.records(trip.id());
            var task = loadTasks.currentForDriver(user, trip.planDate()).stream()
                .filter(t -> t.vehicleId().equals(trip.vehicleId()) && t.tripIndex() == trip.tripIndex()).findFirst();
            int stops = task.map(t -> groups(t).size()).orElse((int) records.stream().map(DeliveryRecord::outletId).distinct().count());
            int orders = task.map(t -> t.lines().size()).orElse(records.size());
            result.add(new DriverViews.PastTrip(trip.planDate(), trip.tripIndex(), trip.vehicleId(),
                task.map(LoadTask::brand).orElse(null), task.map(LoadTask::district).orElse(null), stops, orders,
                count(records, "DELIVERED"), count(records, "PARTIAL"), count(records, "FAILED"), trip.startedAt(), trip.completedAt()));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public DriverViews.OrderDetail order(CurrentUser user, long orderId, LocalDate date) {
        var record = deliveries.recordForOrder(orderId);
        Slot slot = null;
        LoadLine line = null;
        LocalDate day = record.flatMap(r -> deliveries.trip(r.deliveryTripId())).map(DeliveryTrip::planDate).orElse(day(date));
        for (var candidate : slots(user, day)) {
            var match = candidate.task().lines().stream().filter(l -> l.orderId() == orderId).findFirst();
            if (match.isPresent()) { slot = candidate; line = match.get(); break; }
        }
        if (slot == null) throw notFound();
        var order = orderQueries.driverOrders(user, List.of(orderId)).getFirst();
        var trip = slot.trip();
        List<DriverViews.Event> timeline = new ArrayList<>();
        timeline.add(new DriverViews.Event("Order placed", order.placedAt()));
        timeline.add(new DriverViews.Event("Loaded and handed over", slot.task().loadedAt()));
        trip.ifPresent(t -> timeline.add(new DriverViews.Event("Out for delivery", t.startedAt())));
        var visit = slot.visits().stream().filter(v -> v.outletId().equals(order.outletId())).findFirst();
        visit.ifPresent(v -> timeline.add(new DriverViews.Event("Arrived at the outlet", v.arrivedAt())));
        record.ifPresent(r -> timeline.add(new DriverViews.Event(switch (r.outcome()) {
            case "DELIVERED" -> "Delivered";
            case "PARTIAL" -> "Partially delivered";
            default -> "Delivery failed";
        }, r.recordedAt())));
        timeline.removeIf(e -> e.at() == null);
        var assets = deliveries.assetsForOrder(orderId).stream().filter(a -> a.deliveryRecordId() != null).toList();
        var proofs = assets.stream().map(a -> new DriverViews.Proof(a.id(), a.kind(), storage.viewUrl(a.objectKey()), a.width(), a.height(),
            a.uploadedAt())).toList();
        return new DriverViews.OrderDetail(orderId, line.orderRef(), line.outletId(), slot.task().district(), slot.task().brand(),
            line.tempRequirement(), line.units(), loadedUnits(line), slot.task().planDate(), slot.task().tripIndex(), slot.task().vehicleId(),
            order.status(), timeline, record.map(r -> outcome(r, assets)).orElse(null), proofs);
    }

    public DriverViews.Capabilities capabilities() {
        return new DriverViews.Capabilities(storage.configured(), PodImages.MAX_BYTES);
    }

    // ---------------------------------------------------------------- actions
    // Online actions carry the displayed versions. Field commands from the phone's outbox carry the
    // device time instead: they are replayed later, so an action whose effect is already in place is
    // reported as ALREADY_APPLIED, and the driver's record of what happened on the road wins over a
    // plan that changed meanwhile (applied and flagged for the dispatcher).

    @Transactional
    public DriverViews.TripDetail start(CurrentUser user, int tripIndex, LocalDate date, int planVersion) {
        LocalDate day = day(date);
        doStart(user, day, tripIndex, planVersion, clock.instant());
        return detail(user, slot(user, day, tripIndex));
    }

    @Transactional
    public DriverViews.TripDetail arrive(CurrentUser user, int tripIndex, String outletId, LocalDate date, int expectedVersion) {
        LocalDate day = day(date);
        doArrive(user, day, tripIndex, outletId, expectedVersion, clock.instant());
        return detail(user, slot(user, day, tripIndex));
    }

    public record OutcomeCommand(int expectedVersion, String outcome, Integer deliveredUnits, String issueKind,
                                 String recipientName, String notes, List<Long> proofIds) {}

    @Transactional
    public DriverViews.TripDetail record(CurrentUser user, int tripIndex, long orderId, LocalDate date, OutcomeCommand command) {
        LocalDate day = day(date);
        doRecord(user, day, tripIndex, orderId, command.expectedVersion(), command.outcome(), command.deliveredUnits(), command.issueKind(),
            command.recipientName(), command.notes(), command.proofIds() == null ? List.of() : command.proofIds(), clock.instant());
        return detail(user, slot(user, day, tripIndex));
    }

    @Transactional
    public DriverViews.TripDetail depart(CurrentUser user, int tripIndex, String outletId, LocalDate date, int expectedVersion) {
        LocalDate day = day(date);
        doDepart(user, day, tripIndex, outletId, expectedVersion, clock.instant());
        return detail(user, slot(user, day, tripIndex));
    }

    @Transactional
    public DriverViews.TripDetail complete(CurrentUser user, int tripIndex, LocalDate date, int expectedVersion) {
        LocalDate day = day(date);
        doComplete(user, day, tripIndex, expectedVersion, clock.instant());
        return detail(user, slot(user, day, tripIndex));
    }

    /** One action from the phone's outbox, with the time it happened on the device. */
    public record FieldCommand(String actionType, LocalDate planDate, int tripIndex, Integer planVersion, String outletId, Long orderId,
                               String outcome, Integer deliveredUnits, String issueKind, String recipientName, String notes,
                               List<java.util.UUID> proofUploadIds, Instant occurredAt) {}

    /**
     * @param alreadyApplied the effect was already in place (a replay, or the same action recorded online)
     * @param review         applied, but the dispatcher should look at it (for example an order moved while offline)
     */
    public record FieldResult(boolean alreadyApplied, String review) {
        static FieldResult applied() { return new FieldResult(false, null); }
        static FieldResult already() { return new FieldResult(true, null); }
    }

    /** Applies a field command inside the caller's transaction; failures surface as {@link ApiException}. */
    @Transactional
    public FieldResult applyField(CurrentUser user, FieldCommand c) {
        LocalDate day = day(c.planDate());
        Instant at = c.occurredAt() == null ? clock.instant() : c.occurredAt();
        return switch (c.actionType()) {
            case "TRIP_START" -> doStart(user, day, c.tripIndex(), null, at);
            case "STOP_ARRIVE" -> doArrive(user, day, c.tripIndex(), require(c.outletId()), null, at);
            case "ORDER_OUTCOME" -> doRecordField(user, day, c, at);
            case "STOP_DEPART" -> doDepart(user, day, c.tripIndex(), require(c.outletId()), null, at);
            case "TRIP_COMPLETE" -> doComplete(user, day, c.tripIndex(), null, at);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ACTION", "Unknown action type");
        };
    }

    private FieldResult doStart(CurrentUser user, LocalDate day, int tripIndex, Integer planVersion, Instant at) {
        var slot = slot(user, day, tripIndex);
        boolean field = planVersion == null;
        if (slot.trip().isPresent()) {
            if (field) return FieldResult.already();
            throw conflict("TRIP_ALREADY_STARTED", "This trip has already started", Map.of());
        }
        String blocker = startBlocker(user, slot);
        String review = null;
        if (blocker != null && field && !"loaded".equals(slot.task().status()) && handedOverEarlier(user, day, tripIndex)) {
            // The truck left loaded on an earlier version; the dispatcher changed the manifest while the phone was offline.
            review = "ROUTE_CHANGED_OFFLINE";
            blocker = null;
        }
        if (blocker != null) throw conflict(slot.task().status().equals("loaded") ? "PREVIOUS_TRIP_OPEN" : "TRIP_NOT_HANDED_OVER", blocker, Map.of());
        if (!field && planVersion != slot.task().planVersion())
            throw conflict("ROUTE_CHANGED", "The dispatcher published version " + slot.task().planVersion() + "; review the trip before starting",
                Map.of("currentPlanVersion", slot.task().planVersion()));
        long id;
        try {
            id = deliveries.insertTrip(day, slot.task().depot(), slot.task().vehicleId(), tripIndex, user.id(), slot.task().planVersion(), at);
        } catch (DuplicateKeyException e) {
            if (field) return FieldResult.already();
            throw conflict("TRIP_ALREADY_STARTED", "This trip has already started", Map.of());
        }
        orderCommands.markInTransit(user, slot.task().lines().stream().map(LoadLine::orderId).toList());
        audit.record("delivery_trip.started", user, "delivery_trip", String.valueOf(id), null,
            Map.of("vehicleId", slot.task().vehicleId(), "tripIndex", tripIndex, "planVersion", slot.task().planVersion(),
                "orders", slot.task().lines().size(), "source", field ? "sync" : "online", "review", review == null ? "" : review), null);
        return new FieldResult(false, review);
    }

    private boolean handedOverEarlier(CurrentUser user, LocalDate day, int tripIndex) {
        return loadTasks.everForDriver(user, day).stream().anyMatch(t -> t.tripIndex() == tripIndex && t.loadedAt() != null);
    }

    private FieldResult doArrive(CurrentUser user, LocalDate day, int tripIndex, String outletId, Integer expectedVersion, Instant at) {
        boolean field = expectedVersion == null;
        var slot = running(user, day, tripIndex, expectedVersion);
        var stop = groups(slot.task()).stream().filter(g -> g.outletId().equals(outletId)).findFirst();
        String review = null;
        if (stop.isEmpty()) {
            // Offline, the driver may stop at an outlet the dispatcher has since moved off this trip.
            if (!field || !wasOnDriverTrip(user, day, tripIndex, l -> l.outletId().equals(outletId))) throw notFound();
            review = "STOP_NOT_ON_TRIP";
        }
        if (slot.visits().stream().anyMatch(v -> v.outletId().equals(outletId))) {
            if (field) return FieldResult.already();
            throw conflict("STOP_ALREADY_VISITED", "You have already arrived at this stop", Map.of());
        }
        var open = slot.visits().stream().filter(v -> v.departedAt() == null).findFirst();
        if (open.isPresent())
            throw conflict("STOP_IN_PROGRESS", "Finish the stop at " + open.get().outletId() + " first", Map.of("outletId", open.get().outletId()));
        var trip = slot.trip().orElseThrow();
        deliveries.arrive(trip.id(), outletId, user.id(), at);
        bump(trip, expectedVersion, clock.instant());
        int seq = stop.map(StopGroup::seq).orElse(0);
        int expectedSeq = groups(slot.task()).stream().filter(g -> slot.visits().stream().noneMatch(v -> v.outletId().equals(g.outletId())))
            .mapToInt(StopGroup::seq).min().orElse(seq);
        Map<String, Object> after = new LinkedHashMap<>(Map.of("outletId", outletId, "stopSeq", seq, "outOfSequence", seq != expectedSeq,
            "source", field ? "sync" : "online"));
        if (review != null) after.put("review", review);
        audit.record("stop.arrived", user, "delivery_trip", String.valueOf(trip.id()), null, after, null);
        return new FieldResult(false, review);
    }

    private FieldResult doRecordField(CurrentUser user, LocalDate day, FieldCommand c, Instant at) {
        if (c.orderId() == null || c.outcome() == null) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "An outcome needs an order and an outcome");
        List<Long> proofIds = new ArrayList<>();
        var uploads = c.proofUploadIds() == null ? List.<java.util.UUID>of() : c.proofUploadIds();
        for (var clientId : uploads) deliveries.assetByClientId(user.id(), clientId).filter(a -> a.orderId() == c.orderId())
            .ifPresent(a -> proofIds.add(a.id()));
        return doRecord(user, day, c.tripIndex(), c.orderId(), null, c.outcome(), c.deliveredUnits(), c.issueKind(), c.recipientName(), c.notes(),
            proofIds, at, uploads.size() > proofIds.size());
    }

    private FieldResult doRecord(CurrentUser user, LocalDate day, int tripIndex, long orderId, Integer expectedVersion, String outcome,
                                 Integer deliveredUnits, String kind, String recipientName, String notes, List<Long> requestedProofs, Instant at) {
        return doRecord(user, day, tripIndex, orderId, expectedVersion, outcome, deliveredUnits, kind, recipientName, notes, requestedProofs, at, false);
    }

    private FieldResult doRecord(CurrentUser user, LocalDate day, int tripIndex, long orderId, Integer expectedVersion, String outcome,
                                 Integer deliveredUnits, String kind, String recipientName, String notes, List<Long> requestedProofs, Instant at,
                                 boolean proofLost) {
        boolean field = expectedVersion == null;
        var slot = running(user, day, tripIndex, expectedVersion);
        String review = null;
        var current = slot.task().lines().stream().filter(l -> l.orderId() == orderId).findFirst();
        LoadLine line;
        if (current.isPresent()) line = current.get();
        else if (field) {
            // The driver's record wins: the order was on this driver's trip in an earlier version.
            line = historicalLine(user, day, tripIndex, orderId).orElseThrow(DriverService::notFound);
            review = "ORDER_NOT_ON_TRIP";
        } else throw notFound();
        var existing = slot.records().stream().filter(r -> r.orderId() == orderId).findFirst();
        int loaded = loadedUnits(line);
        String recipient = trim(recipientName);
        int delivered;
        switch (outcome) {
            case "DELIVERED" -> {
                if (kind != null) throw invalid("ISSUE_NOT_ALLOWED", "A full delivery has no issue; choose partial or failed to report one");
                delivered = loaded;
            }
            case "PARTIAL" -> {
                if (kind == null) throw invalid("ISSUE_REQUIRED", "Choose what went wrong");
                if (deliveredUnits == null || deliveredUnits < 1 || deliveredUnits >= loaded)
                    throw invalid("DELIVERED_UNITS_INVALID", "Delivered units must be between 1 and " + (loaded - 1));
                delivered = deliveredUnits;
            }
            case "FAILED" -> {
                if (kind == null) throw invalid("ISSUE_REQUIRED", "Choose why the delivery failed");
                delivered = 0;
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Unknown outcome");
        }
        if (existing.isPresent()) {
            var r = existing.get();
            if (field && r.outcome().equals(outcome) && r.deliveredUnits() == delivered) return FieldResult.already();
            Map<String, Object> facts = new LinkedHashMap<>();
            facts.put("recordedOutcome", r.outcome()); facts.put("recordedUnits", r.deliveredUnits());
            facts.put("recordedAt", r.recordedAt().toString()); facts.put("sentOutcome", outcome); facts.put("sentUnits", delivered);
            throw conflict("ORDER_ALREADY_RECORDED", "This order's outcome is already recorded", facts);
        }
        var visit = slot.visits().stream().filter(v -> v.outletId().equals(line.outletId()) && v.departedAt() == null).findFirst();
        if (visit.isEmpty()) throw conflict("NOT_AT_STOP", "Mark your arrival at " + line.outletId() + " first", Map.of());
        boolean handedOver = !"FAILED".equals(outcome);
        if (handedOver && recipient == null) throw invalid("RECIPIENT_REQUIRED", "Enter who received the order");
        var proofIds = requestedProofs.stream().distinct().toList();
        var available = slot.assets().stream().filter(a -> a.orderId() == orderId && a.deliveryRecordId() == null).map(PodAsset::id).toList();
        if (!available.containsAll(proofIds)) throw invalid("PROOF_INVALID", "A proof file does not belong to this order");
        if (handedOver && storage.configured() && proofIds.isEmpty()) {
            // Online the driver adds the proof now; a replayed record is kept and flagged instead of lost.
            if (!field) throw invalid("PROOF_REQUIRED", "Add a photo or the recipient's signature");
            if (review == null) review = "PROOF_MISSING";
        }
        if (proofLost && review == null) review = "PROOF_MISSING";
        var trip = slot.trip().orElseThrow();
        var now = clock.instant();
        long id = deliveries.insertRecord(trip.id(), orderId, line.outletId(), outcome, line.units(), loaded, delivered,
            kind, recipient, trim(notes), user.id(), at, now, review);
        deliveries.attachAssets(proofIds, orderId, id);
        orderCommands.markDelivered(user, orderId, switch (outcome) {
            case "DELIVERED" -> OrderStatus.delivered;
            case "PARTIAL" -> OrderStatus.partial;
            default -> OrderStatus.failed;
        }, review != null && review.equals("ORDER_NOT_ON_TRIP"));
        bump(trip, expectedVersion, now);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("orderId", orderId); after.put("outcome", outcome); after.put("deliveredUnits", delivered);
        after.put("loadedUnits", loaded); after.put("proofs", proofIds.size()); after.put("source", field ? "sync" : "online");
        if (kind != null) after.put("issueKind", kind);
        if (review != null) after.put("review", review);
        audit.record("delivery.recorded", user, "delivery_record", String.valueOf(id), null, after, trim(notes));
        return new FieldResult(false, review);
    }

    private FieldResult doDepart(CurrentUser user, LocalDate day, int tripIndex, String outletId, Integer expectedVersion, Instant at) {
        boolean field = expectedVersion == null;
        var slot = running(user, day, tripIndex, expectedVersion);
        var stop = groups(slot.task()).stream().filter(g -> g.outletId().equals(outletId)).findFirst();
        if (stop.isEmpty() && !(field && slot.visits().stream().anyMatch(v -> v.outletId().equals(outletId)))) throw notFound();
        var visits = slot.visits().stream().filter(v -> v.outletId().equals(outletId)).toList();
        if (field && !visits.isEmpty() && visits.stream().allMatch(v -> v.departedAt() != null)) return FieldResult.already();
        var visit = visits.stream().filter(v -> v.departedAt() == null).findFirst()
            .orElseThrow(() -> conflict("NOT_AT_STOP", "You are not at this stop", Map.of()));
        var pending = stop.map(g -> g.lines().stream().filter(l -> slot.records().stream().noneMatch(r -> r.orderId() == l.orderId()))
            .map(LoadLine::orderRef).toList()).orElse(List.of());
        if (!pending.isEmpty())
            throw conflict("STOP_INCOMPLETE", "Record every order at this stop first", Map.of("pendingOrders", pending));
        var trip = slot.trip().orElseThrow();
        deliveries.depart(visit.id(), user.id(), at.isBefore(visit.arrivedAt()) ? visit.arrivedAt() : at);
        bump(trip, expectedVersion, clock.instant());
        audit.record("stop.departed", user, "delivery_trip", String.valueOf(trip.id()), null,
            Map.of("outletId", outletId, "stopSeq", stop.map(StopGroup::seq).orElse(0), "source", field ? "sync" : "online"), null);
        return FieldResult.applied();
    }

    private FieldResult doComplete(CurrentUser user, LocalDate day, int tripIndex, Integer expectedVersion, Instant at) {
        boolean field = expectedVersion == null;
        if (field) {
            var slot = slot(user, day, tripIndex);
            if (slot.trip().map(t -> "completed".equals(t.status())).orElse(false)) return FieldResult.already();
        }
        var slot = running(user, day, tripIndex, expectedVersion);
        var groups = groups(slot.task());
        long remaining = groups.stream().filter(g -> slot.visits().stream().noneMatch(v -> v.outletId().equals(g.outletId()) && v.departedAt() != null)).count();
        if (remaining > 0)
            throw conflict("TRIP_INCOMPLETE", remaining + (remaining == 1 ? " stop is" : " stops are") + " not finished yet", Map.of("remainingStops", remaining));
        var trip = slot.trip().orElseThrow();
        deliveries.complete(trip.id(), at.isBefore(trip.startedAt()) ? trip.startedAt() : at);
        bump(trip, expectedVersion, clock.instant());
        audit.record("delivery_trip.completed", user, "delivery_trip", String.valueOf(trip.id()), null,
            Map.of("delivered", count(slot.records(), "DELIVERED"), "partial", count(slot.records(), "PARTIAL"),
                "failed", count(slot.records(), "FAILED"), "source", field ? "sync" : "online"), null);
        return FieldResult.applied();
    }

    /**
     * Stores a proof photo or signature for an order still to be recorded; attach it with {@link #record}.
     * With {@code clientUploadId} (the outbox's id for the file) a repeated upload returns the stored file.
     */
    @Transactional
    public DriverViews.PodUpload upload(CurrentUser user, int tripIndex, long orderId, LocalDate date, String kind, byte[] bytes,
                                        java.util.UUID clientUploadId) {
        LocalDate day = day(date);
        if (!List.of("PHOTO", "SIGNATURE").contains(kind)) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_KIND", "Use PHOTO or SIGNATURE");
        if (clientUploadId != null) {
            var stored = deliveries.assetByClientId(user.id(), clientUploadId);
            if (stored.isPresent()) {
                var a = stored.get();
                if (a.orderId() != orderId || !a.kind().equals(kind)) throw conflict("UPLOAD_ID_REUSED", "This upload id belongs to another file", Map.of());
                return new DriverViews.PodUpload(a.id(), a.kind(), a.bytes(), a.width(), a.height());
            }
        }
        var slot = slot(user, day, tripIndex);
        var trip = slot.trip().filter(t -> "in_progress".equals(t.status()))
            .orElseThrow(() -> conflict("TRIP_NOT_RUNNING", "Start the trip first", Map.of()));
        var line = slot.task().lines().stream().filter(l -> l.orderId() == orderId).findFirst()
            .or(() -> clientUploadId == null ? Optional.empty() : historicalLine(user, day, tripIndex, orderId))
            .orElseThrow(DriverService::notFound);
        if (slot.records().stream().anyMatch(r -> r.orderId() == orderId))
            throw conflict("ORDER_ALREADY_RECORDED", "This order's outcome is already recorded", Map.of());
        if (!storage.configured())
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "POD_STORAGE_UNAVAILABLE",
                "Proof storage is not set up on this server. Record the delivery without a photo.");
        var image = PodImages.normalise(bytes, "SIGNATURE".equals(kind));
        String key = "waypoint/pod/" + day + "/" + line.orderRef() + "-" + java.util.UUID.randomUUID() + ("SIGNATURE".equals(kind) ? "-signature" : "-photo");
        String stored = storage.store(key, image.bytes(), image.contentType());
        var now = clock.instant();
        long id = deliveries.insertAsset(trip.id(), orderId, kind, storage.name(), stored, image.contentType(), image.bytes().length,
            image.width(), image.height(), user.id(), now, clientUploadId);
        audit.record("pod.uploaded", user, "pod_asset", String.valueOf(id), null,
            Map.of("orderId", orderId, "kind", kind, "bytes", image.bytes().length), null);
        return new DriverViews.PodUpload(id, kind, image.bytes().length, image.width(), image.height());
    }

    /** The order's line on any version of this trip slot that was published to the driver (current or replaced). */
    private Optional<LoadLine> historicalLine(CurrentUser user, LocalDate day, int tripIndex, long orderId) {
        return loadTasks.everForDriver(user, day).stream().filter(t -> t.tripIndex() == tripIndex)
            .flatMap(t -> t.lines().stream()).filter(l -> l.orderId() == orderId).findFirst();
    }

    private boolean wasOnDriverTrip(CurrentUser user, LocalDate day, int tripIndex, java.util.function.Predicate<LoadLine> match) {
        return loadTasks.everForDriver(user, day).stream().filter(t -> t.tripIndex() == tripIndex)
            .flatMap(t -> t.lines().stream()).anyMatch(match);
    }

    private static String require(String value) {
        if (value == null || value.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "This action needs an outlet");
        return value;
    }

    // ---------------------------------------------------------------- assembly

    private List<Slot> slots(CurrentUser user, LocalDate day) {
        return loadTasks.currentForDriver(user, day).stream().map(task -> slotFor(task)).toList();
    }

    private Slot slot(CurrentUser user, LocalDate day, int tripIndex) {
        return loadTasks.currentForDriver(user, day).stream().filter(t -> t.tripIndex() == tripIndex).findFirst()
            .map(this::slotFor).orElseThrow(DriverService::notFound);
    }

    private Slot slotFor(LoadTask task) {
        var route = routes.current(task.planDate(), task.depot(), task.vehicleId(), task.tripIndex())
            .orElseThrow(() -> conflict("ROUTE_UNAVAILABLE", "This trip is not in the current published plan", Map.of()));
        var trip = deliveries.trip(task.planDate(), task.vehicleId(), task.tripIndex(), false);
        return new Slot(task, route, trip,
            trip.map(t -> deliveries.visits(t.id())).orElse(List.of()),
            trip.map(t -> deliveries.records(t.id())).orElse(List.of()),
            trip.map(t -> deliveries.assetsForTrip(t.id())).orElse(List.of()));
    }

    private Slot running(CurrentUser user, LocalDate day, int tripIndex, Integer expectedVersion) {
        var slot = slot(user, day, tripIndex);
        var trip = slot.trip().orElseThrow(() -> conflict("TRIP_NOT_RUNNING", "Start the trip first", Map.of()));
        if (!"in_progress".equals(trip.status())) throw conflict("TRIP_COMPLETED", "This trip is finished", Map.of());
        if (expectedVersion != null && trip.version() != expectedVersion)
            throw conflict("STALE_TRIP", "The trip changed since you opened it; reload it", Map.of("currentVersion", trip.version()));
        return slot;
    }

    private void bump(DeliveryTrip trip, Integer expected, Instant now) {
        if (expected == null) { deliveries.touch(trip.id(), now); return; }
        if (!deliveries.bumpVersion(trip.id(), expected, now))
            throw conflict("STALE_TRIP", "The trip changed since you opened it; reload it", Map.of());
    }

    private static List<StopGroup> groups(LoadTask task) {
        var lines = task.lines().stream().sorted(Comparator.comparingInt(LoadLine::stopSeq)).toList();
        List<StopGroup> groups = new ArrayList<>();
        List<LoadLine> current = new ArrayList<>();
        for (var line : lines) {
            if (!current.isEmpty() && !current.getLast().outletId().equals(line.outletId())) {
                groups.add(new StopGroup(groups.size() + 1, current.getFirst().outletId(), List.copyOf(current)));
                current = new ArrayList<>();
            }
            current.add(line);
        }
        if (!current.isEmpty()) groups.add(new StopGroup(groups.size() + 1, current.getFirst().outletId(), List.copyOf(current)));
        return groups;
    }

    private String startBlocker(CurrentUser user, Slot slot) {
        if (!"loaded".equals(slot.task().status())) return "The loader has not handed this trip over yet";
        if (slot.task().tripIndex() > 1) {
            var earlier = deliveries.trip(slot.task().planDate(), slot.task().vehicleId(), slot.task().tripIndex() - 1, false);
            boolean earlierPublished = loadTasks.currentForDriver(user, slot.task().planDate()).stream()
                .anyMatch(t -> t.tripIndex() == slot.task().tripIndex() - 1);
            if (earlierPublished && earlier.map(t -> !"completed".equals(t.status())).orElse(true))
                return "Finish trip " + (slot.task().tripIndex() - 1) + " first";
        }
        return null;
    }

    private DriverViews.TripCard card(Slot slot) {
        var detail = stops(slot);
        return card(slot, detail);
    }

    private DriverViews.TripCard card(Slot slot, List<DriverViews.Stop> stops) {
        var task = slot.task();
        var trip = slot.trip();
        String state = trip.map(t -> "completed".equals(t.status()) ? "COMPLETED" : "IN_PROGRESS")
            .orElse("loaded".equals(task.status()) ? "READY" : "LOADING");
        int units = task.lines().stream().mapToInt(LoadLine::units).sum();
        BigDecimal weight = task.lines().stream().map(LoadLine::weightKg).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal volume = task.lines().stream().map(LoadLine::volumeM3).reduce(BigDecimal.ZERO, BigDecimal::add);
        var next = stops.stream().filter(s -> !"COMPLETED".equals(s.status())).findFirst();
        int issues = (int) slot.records().stream().filter(r -> !"DELIVERED".equals(r.outcome())).count();
        return new DriverViews.TripCard(task.tripIndex(), task.planDate(), task.vehicleId(), task.brand(), task.district(), task.depot(), task.planVersion(),
            task.plannedDepart(), stops.size(), task.lines().size(), units, weight, volume, slot.route().distanceKm(),
            slot.route().tripMinutes(), task.lines().stream().anyMatch(l -> "chilled".equals(l.tempRequirement())), state, task.status(),
            (int) stops.stream().filter(s -> "COMPLETED".equals(s.status())).count(), slot.records().size(), issues,
            trip.map(DeliveryTrip::startedAt).orElse(null), trip.map(DeliveryTrip::completedAt).orElse(null),
            next.map(DriverViews.Stop::outletId).orElse(null),
            next.map(s -> s.eta() != null ? s.eta() : s.plannedArrival()).orElse(null));
    }

    private DriverViews.TripDetail detail(CurrentUser user, Slot slot) {
        var stops = stops(slot);
        var card = card(slot, stops);
        var trip = slot.trip();
        Integer current = null;
        if (trip.isPresent() && "in_progress".equals(trip.get().status())) {
            current = stops.stream().filter(s -> "ARRIVED".equals(s.status())).map(DriverViews.Stop::seq).findFirst()
                .orElse(stops.stream().filter(s -> "PENDING".equals(s.status())).map(DriverViews.Stop::seq).findFirst().orElse(null));
        }
        return new DriverViews.TripDetail(card, trip.map(DeliveryTrip::version).orElse(null),
            trip.map(DeliveryTrip::startedPlanVersion).orElse(null),
            trip.map(t -> t.startedPlanVersion() != slot.task().planVersion()).orElse(false),
            trip.isPresent() ? null : startBlocker(user, slot), current, stops);
    }

    private List<DriverViews.Stop> stops(Slot slot) {
        Map<Long, PublishedRoute.Stop> planned = new HashMap<>();
        slot.route().stops().forEach(s -> planned.put(s.orderId(), s));
        Map<Long, DeliveryRecord> records = new HashMap<>();
        slot.records().forEach(r -> records.put(r.orderId(), r));
        Map<String, StopVisit> visits = new HashMap<>();
        slot.visits().forEach(v -> visits.put(v.outletId(), v));
        var etas = etas(slot, planned, visits);
        List<DriverViews.Stop> result = new ArrayList<>();
        for (var group : groups(slot.task())) {
            var first = planned.get(group.lines().getFirst().orderId());
            if (first == null) throw conflict("ROUTE_UNAVAILABLE", "This trip is not in the current published plan", Map.of());
            var visit = visits.get(group.outletId());
            String status = visit == null ? "PENDING" : visit.departedAt() == null ? "ARRIVED" : "COMPLETED";
            LocalTime eta = visit == null ? etas.get(group.lines().getFirst().orderId()) : null;
            var orders = group.lines().stream().map(l -> new DriverViews.Order(l.orderId(), l.orderRef(), l.tempRequirement(), l.units(),
                loadedUnits(l), l.weightKg(), l.volumeM3(),
                records.containsKey(l.orderId()) ? outcome(records.get(l.orderId()), slot.assets()) : null)).toList();
            result.add(new DriverViews.Stop(group.seq(), group.outletId(), slot.task().district(), first.dockType(), first.parkingConstraint(),
                first.windowOpen(), first.windowClose(), first.plannedArrival(), eta,
                eta != null && first.windowClose() != null && eta.isAfter(first.windowClose()),
                status, visit == null ? null : visit.arrivedAt(), visit == null ? null : visit.departedAt(),
                group.lines().stream().mapToInt(LoadLine::units).sum(),
                group.lines().stream().map(LoadLine::weightKg).reduce(BigDecimal.ZERO, BigDecimal::add),
                group.lines().stream().anyMatch(l -> "chilled".equals(l.tempRequirement())),
                (int) group.lines().stream().filter(l -> records.containsKey(l.orderId())).count(), orders));
        }
        return result;
    }

    /**
     * Deterministic ETA fallback (no live location): project the remaining stops from the last thing
     * that happened, with the plan's own formula. Before the trip starts there is no projection.
     */
    private Map<Long, LocalTime> etas(Slot slot, Map<Long, PublishedRoute.Stop> planned, Map<String, StopVisit> visits) {
        Map<Long, LocalTime> result = new HashMap<>();
        var trip = slot.trip();
        if (trip.isEmpty() || "completed".equals(trip.get().status())) return result;
        var remaining = slot.route().stops().stream().filter(s -> !visits.containsKey(s.outletId()))
            .sorted(Comparator.comparingInt(PublishedRoute.Stop::seq)).toList();
        if (remaining.isEmpty()) return result;
        var open = slot.visits().stream().filter(v -> v.departedAt() == null).findFirst();
        var lastDeparture = slot.visits().stream().map(StopVisit::departedAt).filter(java.util.Objects::nonNull).max(Instant::compareTo);
        LocalTime readyAt;
        boolean fromDepot = false;
        if (open.isPresent()) {
            // Still serving a stop: the vehicle is free once its service allowance has run (or now, if later).
            int service = slot.route().stops().stream().filter(s -> s.outletId().equals(open.get().outletId()))
                .mapToInt(PublishedRoute.Stop::serviceMinutes).sum();
            LocalTime done = local(open.get().arrivedAt()).plusMinutes(service);
            LocalTime now = local(clock.instant());
            readyAt = now.isAfter(done) ? now : done;
        } else if (lastDeparture.isPresent()) {
            readyAt = local(lastDeparture.get());
        } else {
            readyAt = local(trip.get().startedAt());
            fromDepot = true;
        }
        var projected = routes.projectArrivals(slot.route(), remaining, readyAt, fromDepot);
        for (int i = 0; i < remaining.size(); i++) result.put(remaining.get(i).orderId(), projected.get(i));
        return result;
    }

    private static DriverViews.Outcome outcome(DeliveryRecord r, List<PodAsset> assets) {
        var attached = assets.stream().filter(a -> a.deliveryRecordId() != null && a.deliveryRecordId() == r.id()).toList();
        return new DriverViews.Outcome(r.outcome(), r.deliveredUnits(), r.issueKind(), r.recipientName(), r.notes(), r.recordedAt(),
            (int) attached.stream().filter(a -> "PHOTO".equals(a.kind())).count(),
            (int) attached.stream().filter(a -> "SIGNATURE".equals(a.kind())).count());
    }

    private static int loadedUnits(LoadLine line) {
        return line.loadedUnits() != null ? line.loadedUnits() : line.units();
    }

    private static int count(List<DeliveryRecord> records, String outcome) {
        return (int) records.stream().filter(r -> outcome.equals(r.outcome())).count();
    }

    private LocalDate day(LocalDate date) { return date == null ? referenceProperties.demoOperatingDate() : date; }

    private static LocalTime local(Instant at) { return at.atZone(TimeConfiguration.BUSINESS_ZONE).toLocalTime(); }

    private static String trim(String value) {
        if (value == null) return null;
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }

    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }

    private static ApiException invalid(String code, String message) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, message); }

    private static DeliveryConflictException conflict(String code, String message, Map<String, Object> properties) {
        return new DeliveryConflictException(code, message, properties);
    }
}
