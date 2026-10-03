package lk.techtrithalon.waypoint.loading.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

public final class LoaderRequests {
    private LoaderRequests() {}

    @Schema(name="LoadTaskCommandRequest")
    public record Command(@NotNull @Min(0) Integer expectedVersion) {}

    @Schema(name="LoadShortfallRequest")
    public record Shortfall(@NotNull @Min(0) Integer expectedVersion,
                            @NotBlank @Pattern(regexp="MISSING|DAMAGED|WRONG_ITEM") String kind,
                            @NotNull @Min(1) Integer shortUnits,
                            @Size(max=500) String note,
                            @Schema(description="True holds the vehicle until the dispatcher decides") @NotNull Boolean holdsVehicle) {}

    @Schema(name="LoadingIssueDecisionRequest")
    public record Decision(@NotNull @Min(0) Integer expectedVersion,
                           @NotBlank @Pattern(regexp="SEND_SHORT|REPLANNED") String decision,
                           @NotBlank @Size(max=500) String note) {}
}
