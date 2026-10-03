package lk.techtrithalon.waypoint.receipt.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;

public interface ReceiptRepository {
    List<ReceiptViews.Receipt> receiptsForOrders(Collection<Long> orderIds);
    Optional<ReceiptViews.Receipt> receiptForOrder(long orderId);
    long insertReceipt(long orderId, long recordId, String outletId, String outcome, int deliveredUnits, String kind, Integer affectedUnits,
                       String note, long actor, String actorName, Instant at);
    long insertDiscrepancy(long receiptId, long orderId, String orderRef, String outletId, String depot, int deliveredUnits, String kind,
                           int affectedUnits, String note, String vehicleId, String driverName, Instant deliveredAt, long actor,
                           String actorName, Instant at);
    List<ReceiptViews.Discrepancy> discrepanciesForOrders(Collection<Long> orderIds);
    List<ReceiptViews.Discrepancy> discrepanciesForOutlet(String outletId, String status);
    List<ReceiptViews.Discrepancy> discrepanciesForDepot(String depot, String status);
    Optional<ReceiptViews.Discrepancy> findDiscrepancy(long id, boolean forUpdate);
    boolean resolve(long id, int expectedVersion, String decision, String note, long actor, String actorName, Instant at);
}
