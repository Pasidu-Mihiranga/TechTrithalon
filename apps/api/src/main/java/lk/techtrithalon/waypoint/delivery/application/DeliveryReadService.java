package lk.techtrithalon.waypoint.delivery.application;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.delivery.domain.DeliveredOrder;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryProblem;
import lk.techtrithalon.waypoint.delivery.domain.PodAsset;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Published read boundary: the driver's recorded outcomes for given orders. The caller (the receipt
 * module) has already limited the ids to orders the signed-in user may see.
 */
@Service
public class DeliveryReadService {
    private final DeliveryRepository deliveries;
    private final LoadTaskService loadTasks;
    private final OrderQueryService orders;

    public DeliveryReadService(DeliveryRepository deliveries, LoadTaskService loadTasks, OrderQueryService orders) {
        this.deliveries = deliveries; this.loadTasks = loadTasks; this.orders = orders;
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasAnyRole('STORE_MANAGER','DISPATCHER')")
    public List<DeliveredOrder> forOrders(CurrentUser user, List<Long> orderIds) {
        if (orderIds.isEmpty()) return List.of();
        var assets = deliveries.assetsForOrders(orderIds);
        return deliveries.recordsForOrders(orderIds).stream().map(r -> {
            var mine = assets.stream().filter(a -> a.orderId() == r.orderId() && a.deliveryRecordId() != null && a.deliveryRecordId() == r.id()).toList();
            return new DeliveredOrder(r.orderId(), r.id(), r.outcome(), r.orderedUnits(), r.loadedUnits(), r.deliveredUnits(), r.issueKind(),
                r.recipientName(), r.occurredAt(), count(mine, "PHOTO"), count(mine, "SIGNATURE"));
        }).toList();
    }

    private static int count(List<PodAsset> assets, String kind) { return (int) assets.stream().filter(a -> kind.equals(a.kind())).count(); }

    /**
     * Published for the dispatcher's exceptions queue: what the drivers of a run recorded that needs a
     * look (partial or failed orders, and records kept with a review reason), newest first.
     */
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<DeliveryProblem> problemsForRun(CurrentUser user, LocalDate date, String depot) {
        if (!user.canAccessDepot(depot)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        Map<String, String> drivers = new HashMap<>();
        loadTasks.currentForRun(user, date, depot).forEach(t -> drivers.put(t.vehicleId() + "#" + t.tripIndex(), t.driverName()));
        var trips = deliveries.tripsForRun(date, depot);
        var records = trips.stream().flatMap(t -> deliveries.records(t.id()).stream()
            .filter(r -> !"DELIVERED".equals(r.outcome()) || r.reviewReason() != null).map(r -> Map.entry(t, r))).toList();
        if (records.isEmpty()) return List.of();
        Map<Long, String> refs = new HashMap<>();
        for (CustomerOrder o : orders.ordersByIds(user, records.stream().map(e -> e.getValue().orderId()).toList())) refs.put(o.id(), o.ref());
        return records.stream().map(e -> {
            var t = e.getKey();
            var r = e.getValue();
            return new DeliveryProblem(r.id(), r.orderId(), refs.getOrDefault(r.orderId(), "Order " + r.orderId()), r.outletId(), t.vehicleId(), t.tripIndex(),
                drivers.get(t.vehicleId() + "#" + t.tripIndex()), t.planDate(), r.outcome(), r.orderedUnits(), r.loadedUnits(), r.deliveredUnits(),
                r.issueKind(), r.notes(), r.reviewReason(), r.occurredAt(), r.recordedAt());
        }).sorted(Comparator.comparing(DeliveryProblem::recordedAt).reversed().thenComparing(DeliveryProblem::recordId, Comparator.reverseOrder())).toList();
    }
}
