package lk.techtrithalon.waypoint.planning.api;

import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

public final class ManualPlanRequests {
    private ManualPlanRequests() {}
    @Schema(name="ManualPlanCreateRequest")
    public record Create(@NotNull @Positive Long snapshotId, @NotBlank @Size(max=500) String reason) {}
    @Schema(name="ManualPlanCommandRequest")
    public record Command(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason) {}
    @Schema(name="ManualPlanTripRequest")
    public record Trip(@Positive Long id, @NotBlank @Size(max=8) String vehicleId,
                       @Min(1) @Max(2) int tripIndex, @NotBlank @Size(max=16) String brand,
                       @NotBlank @Size(max=32) String district,
                       @NotNull @Size(max=100000) List<@NotNull @Positive Long> orderIds) {}
    @Schema(name="ManualPlanDispositionRequest")
    public record Disposition(@Positive long orderId, @NotBlank @Pattern(regexp="UNASSIGNED|DEFERRED") String code,
                              @NotBlank @Size(max=500) String reason, LocalDate nextDeliveryDate) {}
    @Schema(name="ManualPlanReplaceRequest")
    public record Replace(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                          @NotNull @Size(max=10000) List<@NotNull @Valid Trip> trips,
                          @NotNull @Size(max=100000) List<@NotNull @Valid Disposition> dispositions) {}
    @Schema(name="ManualPlanAddTripRequest")
    public record AddTrip(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                          @NotNull @Valid Trip trip) {}
    @Schema(name="ManualPlanMoveRequest")
    public record Move(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                       @Positive long orderId, @Positive Long fromTripId, @Positive Long toTripId,
                       @Min(1) Integer position) {}
    @Schema(name="ManualPlanVehicleRequest")
    public record Vehicle(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                          @NotBlank @Size(max=8) String vehicleId, @Min(1) @Max(2) int tripIndex) {}
    @Schema(name="ManualPlanSequenceRequest")
    public record Sequence(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                           @NotNull @Size(max=100000) List<@NotNull @Positive Long> orderIds) {}
    @Schema(name="ManualPlanDeferRequest")
    public record Defer(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                        LocalDate nextDeliveryDate) {}
}
