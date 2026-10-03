package lk.techtrithalon.waypoint.delivery.application;

import java.util.List;
import lk.techtrithalon.waypoint.delivery.domain.DeliveredOrder;
import lk.techtrithalon.waypoint.delivery.domain.PodAsset;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
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

    public DeliveryReadService(DeliveryRepository deliveries) { this.deliveries = deliveries; }

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
}
