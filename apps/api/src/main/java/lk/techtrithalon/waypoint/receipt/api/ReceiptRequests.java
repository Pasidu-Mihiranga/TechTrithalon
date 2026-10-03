package lk.techtrithalon.waypoint.receipt.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

public final class ReceiptRequests {
    private ReceiptRequests() {}

    @Schema(name="ReceiptDisputeRequest")
    public record Dispute(@NotBlank @Pattern(regexp="SHORT|DAMAGED|WRONG_ITEM|OTHER") String kind,
                          @Schema(description="Units that did not arrive right, 1 to the units delivered") @NotNull @Min(1) Integer affectedUnits,
                          @Schema(description="Required for OTHER") @Size(max=500) String note) {}

    @Schema(name="ReceiptDecisionRequest")
    public record Decision(@NotNull @Min(0) Integer expectedVersion,
                           @NotBlank @Pattern(regexp="CREDIT|REPLACEMENT|NO_ACTION") String decision,
                           @NotBlank @Size(max=500) String note) {}
}
