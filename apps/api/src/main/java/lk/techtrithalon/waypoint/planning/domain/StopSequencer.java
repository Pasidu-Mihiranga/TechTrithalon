package lk.techtrithalon.waypoint.planning.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Default stop order for a trip: Earliest Due Date, i.e. effective window close ascending,
 * ties broken by order ID, orders without a window last. Deterministic and O(n log n).
 *
 * <p>Within one trip every inter-stop leg is the district constant, so order never changes trip
 * minutes, distance or fuel; it changes arrival times and therefore R8 feasibility. EDD is a
 * default only: an explicit dispatcher sequence is always kept, and the validator re-checks the
 * resulting schedule either way.
 */
public final class StopSequencer {

    public static final Comparator<PlanOrder> EDD = Comparator
        .comparing(PlanOrder::effectiveWindowClose, Comparator.nullsLast(Comparator.naturalOrder()))
        .thenComparingLong(PlanOrder::id);

    private StopSequencer() {}

    /** EDD order for a newly built trip. IDs not found in {@code orders} keep their relative order at the end. */
    public static List<Long> defaultSequence(List<Long> orderIds, Map<Long, PlanOrder> orders) {
        List<Long> known = new ArrayList<>();
        List<Long> unknown = new ArrayList<>();
        for (Long id : orderIds) (orders.containsKey(id) ? known : unknown).add(id);
        known.sort((a, b) -> EDD.compare(orders.get(a), orders.get(b)));
        known.addAll(unknown);
        return known;
    }

    /**
     * Where an order goes when added to an existing trip without an explicit position: before the
     * first stop it precedes under EDD. The existing stops keep the order the dispatcher gave them.
     */
    public static int defaultInsertionIndex(List<Long> existing, long orderId, Map<Long, PlanOrder> orders) {
        PlanOrder incoming = orders.get(orderId);
        if (incoming == null) return existing.size();
        for (int i = 0; i < existing.size(); i++) {
            PlanOrder current = orders.get(existing.get(i));
            if (current != null && EDD.compare(incoming, current) < 0) return i;
        }
        return existing.size();
    }
}
