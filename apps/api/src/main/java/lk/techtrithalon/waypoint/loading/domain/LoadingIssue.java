package lk.techtrithalon.waypoint.loading.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

/** A shortfall reported before departure; an open issue that holds the vehicle blocks handover. */
public record LoadingIssue(long id, long loadTaskId, long loadLineId, long orderId, String orderRef, String outletId,
                           LocalDate planDate, String depot, String vehicleId, int tripIndex,
                           @Schema(description="MISSING, DAMAGED or WRONG_ITEM") String kind,
                           int orderedUnits, int shortUnits, @Schema(nullable=true) String note, boolean holdsVehicle,
                           @Schema(description="OPEN or RESOLVED") String status,
                           String reportedByName, Instant reportedAt,
                           @Schema(nullable=true, description="SEND_SHORT or REPLANNED") String decision,
                           @Schema(nullable=true) String decisionNote,
                           @Schema(nullable=true) String resolvedByName,
                           @Schema(nullable=true) Instant resolvedAt,
                           int version) {
    public int availableUnits() { return orderedUnits - shortUnits; }
}
