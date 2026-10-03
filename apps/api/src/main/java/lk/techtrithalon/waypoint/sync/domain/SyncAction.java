package lk.techtrithalon.waypoint.sync.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** One action from the driver's outbox. The device generates {@code clientActionId} (UUIDv7) before saving it. */
@Schema(name="SyncAction")
public record SyncAction(
    @NotNull UUID clientActionId,
    @NotBlank @Pattern(regexp="TRIP_START|STOP_ARRIVE|ORDER_OUTCOME|STOP_DEPART|TRIP_COMPLETE") String actionType,
    @NotNull LocalDate planDate,
    @NotNull @Min(1) @Max(2) Integer tripIndex,
    @Schema(description="Plan version the phone showed when the action was taken", nullable=true) @Min(1) Integer planVersion,
    @Schema(description="Device time of the action") @NotNull Instant occurredAt,
    @Schema(description="STOP_ARRIVE and STOP_DEPART", nullable=true) @Size(max=8) String outletId,
    @Schema(description="ORDER_OUTCOME", nullable=true) Long orderId,
    @Schema(nullable=true) @Pattern(regexp="DELIVERED|PARTIAL|FAILED") String outcome,
    @Schema(nullable=true) @Min(0) Integer deliveredUnits,
    @Schema(nullable=true) @Pattern(regexp="CUSTOMER_UNAVAILABLE|MISSING|DAMAGED|WRONG_ITEM|REFUSED|OTHER") String issueKind,
    @Schema(nullable=true) @Size(max=120) String recipientName,
    @Schema(nullable=true) @Size(max=500) String notes,
    @Schema(description="Client ids of proof files uploaded for this order", nullable=true) @Size(max=6) List<@NotNull UUID> proofUploadIds) {}
