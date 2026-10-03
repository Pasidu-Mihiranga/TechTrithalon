package lk.techtrithalon.waypoint.planning.api;

import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.util.List;

public final class ManualPlanRequests {
    private ManualPlanRequests() {}
    /** Figma defer-dialog reasons: capacity, no reefer, window conflict, van access, other (free text). */
    public static final String REASON_CODES="CAPACITY|NO_REEFER|WINDOW_CONFLICT|VAN_ACCESS|OTHER";
    @Schema(name="ManualPlanCreateRequest")
    public record Create(@NotNull @Positive Long snapshotId, @NotBlank @Size(max=500) String reason) {}
    @Schema(name="ManualPlanCommandRequest")
    public record Command(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason) {}
    @Schema(name="ManualPlanTripRequest")
    public record Trip(@Positive Long id, @NotBlank @Size(max=8) String vehicleId,
                       @Min(1) @Max(2) int tripIndex, @NotBlank @Size(max=16) String brand,
                       @NotBlank @Size(max=32) String district,
                       @Schema(description="On trip creation the stops are placed in the default EDD order "
                           + "(effective window close, then order ID); set an explicit order with the sequence endpoint")
                       @NotNull @Size(max=100000) List<@NotNull @Positive Long> orderIds) {}
    @Schema(name="ManualPlanDispositionRequest")
    public record Disposition(@Positive long orderId, @NotBlank @Pattern(regexp="UNASSIGNED|DEFERRED") String code,
                              @NotBlank @Size(max=500) String reason, LocalDate nextDeliveryDate,
                              @Schema(description="Required for DEFERRED") @Pattern(regexp=REASON_CODES) String reasonCode,
                              @Schema(description="Defaults to true") Boolean protectNextRun,
                              @Schema(description="Defaults to true") Boolean notifyStore) {}
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
                       @Schema(description="1-based stop position kept exactly as given; when omitted the order "
                           + "takes its EDD slot and the other stops keep their order") @Min(1) Integer position) {}
    @Schema(name="ManualPlanVehicleRequest")
    public record Vehicle(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                          @NotBlank @Size(max=8) String vehicleId, @Min(1) @Max(2) int tripIndex) {}
    @Schema(name="ManualPlanSequenceRequest")
    public record Sequence(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                           @NotNull @Size(max=100000) List<@NotNull @Positive Long> orderIds) {}
    @Schema(name="ManualPlanDeferRequest")
    public record Defer(@NotNull @Min(0) Integer expectedVersion, @NotBlank @Size(max=500) String reason,
                        LocalDate nextDeliveryDate,
                        @Schema(description="Required when deferring; ignored on restore") @Pattern(regexp=REASON_CODES) String reasonCode,
                        @Schema(description="Defaults to true") Boolean protectNextRun,
                        @Schema(description="Defaults to true") Boolean notifyStore) {}
}
