package lk.techtrithalon.waypoint.planning.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.DeliveryDateService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.domain.DeferralRecord;
import lk.techtrithalon.waypoint.planning.domain.DeferralRun;
import lk.techtrithalon.waypoint.planning.domain.ManualPlan;
import lk.techtrithalon.waypoint.planning.domain.OrderFairness;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Durable deferral history and repeat-skip evidence. Fairness facts are derived from the
 * append-only history plus source facts imported with scenario orders, never from counters.
 */
@Service
public class DeferralService {
    /** How far back consecutive skips are traced. */
    private static final int HISTORY_DAYS = 60;

    private final DeferralRepository deferrals;
    private final OrderQueryService orders;
    private final DeliveryDateService deliveryDates;
    private final ReferenceService reference;
    private final AuditService audit;
    private final Clock clock;

    public DeferralService(DeferralRepository deferrals, OrderQueryService orders, DeliveryDateService deliveryDates,
                           ReferenceService reference, AuditService audit, Clock clock) {
        this.deferrals = deferrals; this.orders = orders; this.deliveryDates = deliveryDates;
        this.reference = reference; this.audit = audit; this.clock = clock;
    }

    /** Fairness evidence for every order in a planning run. */
    @PreAuthorize("hasRole('DISPATCHER')")
    public Map<Long, OrderFairness> fairness(CurrentUser user, LocalDate planDate, Collection<Long> orderIds) {
        if (orderIds.isEmpty()) return Map.of();
        List<CustomerOrder> rows = orders.ordersByIds(user, List.copyOf(orderIds));
        Set<String> outlets = rows.stream().map(CustomerOrder::outletId).collect(Collectors.toCollection(TreeSet::new));
        List<LocalDate> previousDays = reference.calendar(planDate.minusDays(HISTORY_DAYS), planDate.minusDays(1)).stream()
            .filter(CalendarDay::operating).map(CalendarDay::date).sorted(Comparator.reverseOrder()).toList();
        Map<String, Set<LocalDate>> skippedDays = new HashMap<>();
        Map<String, LocalDate> lastSkip = new HashMap<>();
        for (var d : deferrals.historyForOutlets(outlets, planDate.minusDays(HISTORY_DAYS), planDate)) {
            skippedDays.computeIfAbsent(d.outletId(), k -> new HashSet<>()).add(d.planDate());
            lastSkip.merge(d.outletId(), d.planDate(), (a, b) -> a.isAfter(b) ? a : b);
        }
        Map<Long, DeferralRepository.OutletDeferral> carried = new HashMap<>();
        for (var d : deferrals.carriedInto(orderIds, planDate)) carried.putIfAbsent(d.orderId(), d);

        Map<Long, OrderFairness> result = new TreeMap<>();
        for (CustomerOrder order : rows) {
            Set<LocalDate> days = skippedDays.getOrDefault(order.outletId(), Set.of());
            int streak = 0;
            for (LocalDate day : previousDays) { if (days.contains(day)) streak++; else break; }
            boolean previous = !previousDays.isEmpty() && days.contains(previousDays.getFirst());
            String source = streak > 0 || !days.isEmpty() ? "history" : "none";
            // The imported flag describes the operating day before the requested delivery date. It extends
            // the streak only when our own history is unbroken from that date up to this run.
            boolean reachesRequestedDate = streak == 0 ? planDate.equals(order.orderDate())
                : previousDays.get(streak - 1).equals(order.orderDate());
            if (reachesRequestedDate && Boolean.TRUE.equals(order.sourceDeferredYesterday())) {
                streak++;
                previous = true;
                source = streak == 1 ? "source" : "history+source";
            }
            var carry = carried.get(order.id());
            result.put(order.id(), new OrderFairness(order.id(), previous, streak, lastSkip.get(order.outletId()),
                order.sourceDaysSinceServed(), source, carry != null, carry == null ? null : carry.planDate(),
                carry == null ? null : carry.reasonCode(), carry != null && carry.protectNextRun()));
        }
        return result;
    }

    /** Next planning run when the dispatcher did not choose one: the first operating day after the plan date. */
    public LocalDate nextRun(LocalDate planDate, LocalDate requested) {
        return requested != null ? requested : deliveryDates.firstOperatingAfter(planDate);
    }

    /**
     * Records the published deferrals of a plan. Runs inside the publication transaction, so a
     * failure rolls back the plan, order transitions and fuel together.
     */
    @PreAuthorize("hasRole('DISPATCHER')")
    public void recordPublished(CurrentUser user, ManualPlan plan, List<ManualPlan.OrderDisposition> deferred) {
        if (deferred.isEmpty()) return;
        var ids = deferred.stream().map(ManualPlan.OrderDisposition::orderId).toList();
        var fairness = fairness(user, plan.planDate(), ids);
        Map<Long, CustomerOrder> rows = orders.ordersByIds(user, ids).stream()
            .collect(Collectors.toMap(CustomerOrder::id, o -> o));
        var now = clock.instant();
        for (var d : deferred) {
            var order = rows.get(d.orderId());
            var fair = fairness.get(d.orderId());
            if (order == null || fair == null) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            LocalDate next = nextRun(plan.planDate(), d.nextDeliveryDate());
            int consecutive = fair.priorConsecutiveDeferrals() + 1;
            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("ruleCode", DeferralRecord.ruleFor(d.reasonCode()));
            evidence.put("deferredPreviousOperatingDay", fair.deferredPreviousOperatingDay());
            evidence.put("priorConsecutiveDeferrals", fair.priorConsecutiveDeferrals());
            evidence.put("lastDeferralDate", fair.lastDeferralDate());
            evidence.put("daysSinceLastServed", fair.daysSinceLastServed());
            evidence.put("fairnessEvidenceSource", fair.evidenceSource());
            evidence.put("carriedForward", fair.carriedForward());
            evidence.put("carriedFromDate", fair.carriedFromDate());
            evidence.put("protectedThisRun", fair.protectedThisRun());
            evidence.put("requestedDeliveryDate", order.orderDate());
            long decider = d.decidedBy() == null ? user.id() : d.decidedBy();
            String deciderName = d.decidedByName() == null ? user.displayName() : d.decidedByName();
            long id = deferrals.insert(new DeferralRepository.NewDeferral(order.id(), order.ref(), order.brand(),
                order.tempRequirement(), order.outletId(), plan.id(), plan.planDate(), next, plan.depot(), d.reasonCode(),
                DeferralRecord.ruleFor(d.reasonCode()), d.reason(), d.protectNextRun(), d.notifyStore(), consecutive, evidence,
                decider, deciderName, d.decidedAt() == null ? now : d.decidedAt(), user.id(), now));
            audit.record("deferral.recorded", user, "deferral", String.valueOf(id), null, evidence, d.reason());
        }
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public DeferralRun forRun(CurrentUser user, LocalDate date, String depot) {
        reference.day(date);
        String selected = depot == null || depot.isBlank() ? user.depot() : depot;
        if (selected == null) throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED", "Choose a depot");
        if (!user.canAccessDepot(selected) || !reference.depots(user).contains(selected)) throw missing();
        return DeferralRun.of(date, selected, withStatus(user, deferrals.forRun(date, selected)));
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public List<DeferralRecord> storeNotices(CurrentUser user) {
        if (user.outletId() == null) throw missing();
        return deferrals.forOutlet(user.outletId(), true);
    }

    @Transactional
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public DeferralRecord acknowledge(CurrentUser user, long id) {
        var notice = deferrals.find(id).filter(d -> d.notifyStore() && user.canAccessOutlet(d.outletId()))
            .orElseThrow(DeferralService::missing);
        if (notice.acknowledgedAt() != null) return notice;
        if (deferrals.acknowledge(id, user.id(), clock.instant()))
            audit.record("deferral.acknowledged", user, "deferral", String.valueOf(id), null, Map.of("deferralId", id), null);
        return deferrals.find(id).orElseThrow();
    }

    private List<DeferralRecord> withStatus(CurrentUser user, List<DeferralRecord> rows) {
        if (rows.isEmpty()) return rows;
        Map<Long, String> status = orders.ordersByIds(user, rows.stream().map(DeferralRecord::orderId).distinct().toList())
            .stream().collect(Collectors.toMap(CustomerOrder::id, CustomerOrder::status));
        return rows.stream().map(r -> r.withStatus(status.get(r.orderId()))).toList();
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
}
