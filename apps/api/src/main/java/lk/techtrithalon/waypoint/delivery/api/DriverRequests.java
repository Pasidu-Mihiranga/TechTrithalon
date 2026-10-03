package lk.techtrithalon.waypoint.delivery.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.util.List;

public final class DriverRequests {
    private DriverRequests() {}

    @Schema(name="DriverStartTripRequest")
    public record Start(@Schema(description="Plan version shown on the trip; a newer one must be reviewed first") @NotNull @Min(1) Integer planVersion) {}

    @Schema(name="DriverTripCommandRequest")
    public record Command(@NotNull @Min(0) Integer expectedVersion) {}

    @Schema(name="DriverOutcomeRequest")
    public record Outcome(@NotNull @Min(0) Integer expectedVersion,
                          @NotBlank @Pattern(regexp="DELIVERED|PARTIAL|FAILED") String outcome,
                          @Schema(description="Required for PARTIAL: units handed over") @Min(0) Integer deliveredUnits,
                          @Schema(description="Required for PARTIAL and FAILED")
                          @Pattern(regexp="CUSTOMER_UNAVAILABLE|MISSING|DAMAGED|WRONG_ITEM|REFUSED|OTHER") String issueKind,
                          @Schema(description="Required unless FAILED") @Size(max=120) String recipientName,
                          @Size(max=500) String notes,
                          @Schema(description="Uploaded proof files for this order") @Size(max=6) List<@NotNull Long> proofIds) {}
}
