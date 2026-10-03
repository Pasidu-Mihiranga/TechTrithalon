package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Candidate assignments reference frozen inputs by ID; clients cannot supply operational quantities. */
public record ManualPlan(long id, long snapshotId, LocalDate planDate, String depot, int version,
                         String status, int lockVersion, long createdBy, Instant createdAt,
                         Instant updatedAt, Long publishedBy, Instant publishedAt,
                         @Schema(description="The published plan this candidate revises; null for the first version of a run", nullable=true)
                         Long basedOnPlanId,
                         @Schema(description="Set when a later version replaced this published plan", nullable=true)
                         Long supersededByPlanId,
                         @Schema(nullable=true) Instant supersededAt,
                         @Schema(description="Rule set the published schedule was validated with", nullable=true)
                         String ruleVersion,
                         List<TripAssignment> trips, List<OrderDisposition> dispositions) {
    public ManualPlan { trips = List.copyOf(trips); dispositions = List.copyOf(dispositions); }
    public record TripAssignment(long id, String vehicleId, int tripIndex, String brand,
                                 String district, List<Long> orderIds) {
        public TripAssignment { orderIds = List.copyOf(orderIds); }
    }
    /**
     * Why an order is not on a trip. DEFERRED carries the Figma reason code, the protect/notify
     * choices and who decided; publication turns it into append-only deferral history.
     */
    public record OrderDisposition(long orderId, String code, String reason, LocalDate nextDeliveryDate,
                                   String reasonCode, boolean protectNextRun, boolean notifyStore,
                                   Long decidedBy, String decidedByName, Instant decidedAt) {
        public OrderDisposition(long orderId, String code, String reason, LocalDate nextDeliveryDate) {
            this(orderId, code, reason, nextDeliveryDate, null, true, true, null, null, null);
        }
        /** Same decision, ignoring who recorded it. */
        public boolean sameDecision(OrderDisposition other) {
            return other != null && orderId == other.orderId && code.equals(other.code) && reason.equals(other.reason)
                && java.util.Objects.equals(nextDeliveryDate, other.nextDeliveryDate)
                && java.util.Objects.equals(reasonCode, other.reasonCode)
                && protectNextRun == other.protectNextRun && notifyStore == other.notifyStore;
        }
        public OrderDisposition decidedBy(long actor, String actorName, Instant at) {
            return new OrderDisposition(orderId, code, reason, nextDeliveryDate, reasonCode, protectNextRun, notifyStore,
                actor, actorName, at);
        }
    }
}
