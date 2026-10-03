package lk.techtrithalon.waypoint.delivery.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

/** A recorded outcome the dispatcher should look at: partial, failed, or kept with a review reason. */
public record DeliveryProblem(long recordId, long orderId, String orderRef, String outletId, String vehicleId, int tripIndex,
                              @Schema(nullable=true) String driverName, LocalDate planDate, String outcome,
                              int orderedUnits, int loadedUnits, int deliveredUnits,
                              @Schema(nullable=true) String issueKind, @Schema(nullable=true) String notes,
                              @Schema(nullable=true) String reviewReason, Instant occurredAt, Instant recordedAt) {}
