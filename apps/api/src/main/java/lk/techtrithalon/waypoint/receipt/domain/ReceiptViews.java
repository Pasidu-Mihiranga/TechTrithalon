package lk.techtrithalon.waypoint.receipt.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** What the store manager's delivery and receipt screens show; every value is computed on the server. */
public final class ReceiptViews {
    private ReceiptViews() {}

    @Schema(name="ReceiptDeliveryList")
    public record DeliveryList(String outletId, List<DeliveryRow> rows) {}

    @Schema(name="ReceiptDeliveryRow")
    public record DeliveryRow(long orderId, String orderRef, LocalDate planDate,
                              @Schema(description="PENDING (planned or loading), IN_DELIVERY or DELIVERED (the driver recorded an outcome)") String phase,
                              @Schema(description="NONE, CONFIRMED, DISPUTED (open) or RESOLVED") String receipt,
                              String tempRequirement, int units,
                              @Schema(nullable=true) LocalTime windowOpen, @Schema(nullable=true) LocalTime windowClose,
                              @Schema(nullable=true) String driverName, @Schema(nullable=true) String vehicleId,
                              @Schema(nullable=true) Integer tripIndex, @Schema(nullable=true) LocalTime plannedArrival,
                              @Schema(nullable=true, description="DELIVERED, PARTIAL or FAILED, once recorded") String outcome,
                              @Schema(nullable=true) Integer deliveredUnits, @Schema(nullable=true) Instant deliveredAt) {}

    @Schema(name="ReceiptDeliveryDetail")
    public record DeliveryDetail(DeliveryRow row, String outletId, String district, String brand, String dockType,
                                 @Schema(nullable=true) String parkingConstraint,
                                 @Schema(description="Order status") String status, int loadedUnits,
                                 @Schema(nullable=true, description="The driver's reason when the order was not delivered in full") String issueKind,
                                 @Schema(nullable=true) String recipientName, int photos, int signatures,
                                 @Schema(nullable=true) Receipt receiptRecord, @Schema(nullable=true) Discrepancy discrepancy,
                                 boolean canConfirm, @Schema(nullable=true, description="Why the receipt cannot be recorded yet") String blocker,
                                 List<Event> timeline) {}

    @Schema(name="ReceiptEvent")
    public record Event(String label, Instant at) {}

    @Schema(name="ReceiptRecord")
    public record Receipt(long id, long orderId, long deliveryRecordId, String outletId,
                          @Schema(description="CONFIRMED or DISPUTED") String outcome, int deliveredUnits,
                          @Schema(nullable=true, description="SHORT, DAMAGED, WRONG_ITEM or OTHER") String kind,
                          @Schema(nullable=true) Integer affectedUnits, @Schema(nullable=true) String note,
                          String confirmedByName, Instant confirmedAt) {}

    @Schema(name="ReceiptDiscrepancy")
    public record Discrepancy(long id, long receiptId, long orderId, String orderRef, String outletId, String depot, int deliveredUnits,
                              String kind, int affectedUnits, @Schema(nullable=true) String note,
                              @Schema(nullable=true) String vehicleId, @Schema(nullable=true) String driverName,
                              @Schema(nullable=true) Instant deliveredAt, String reportedByName, Instant reportedAt,
                              @Schema(description="OPEN or RESOLVED") String status,
                              @Schema(nullable=true, description="CREDIT, REPLACEMENT or NO_ACTION") String decision,
                              @Schema(nullable=true) String decisionNote, @Schema(nullable=true) String resolvedByName,
                              @Schema(nullable=true) Instant resolvedAt, int version) {}
}
