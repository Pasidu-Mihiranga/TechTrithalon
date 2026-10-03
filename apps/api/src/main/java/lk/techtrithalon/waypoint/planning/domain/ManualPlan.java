package lk.techtrithalon.waypoint.planning.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Candidate assignments reference frozen inputs by ID; clients cannot supply operational quantities. */
public record ManualPlan(long id, long snapshotId, LocalDate planDate, String depot, int version,
                         String status, int lockVersion, long createdBy, Instant createdAt,
                         Instant updatedAt, Long publishedBy, Instant publishedAt,
                         List<TripAssignment> trips, List<OrderDisposition> dispositions) {
    public ManualPlan { trips = List.copyOf(trips); dispositions = List.copyOf(dispositions); }
    public record TripAssignment(long id, String vehicleId, int tripIndex, String brand,
                                 String district, List<Long> orderIds) {
        public TripAssignment { orderIds = List.copyOf(orderIds); }
    }
    public record OrderDisposition(long orderId, String code, String reason, LocalDate nextDeliveryDate) {}
}
