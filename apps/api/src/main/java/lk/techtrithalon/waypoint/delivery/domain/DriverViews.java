package lk.techtrithalon.waypoint.delivery.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** What the driver's screens show. Every count and time is computed here; the phone only formats. */
public final class DriverViews {
    private DriverViews() {}

    @Schema(name="DriverHome")
    public record Home(LocalDate planDate,
                       @Schema(nullable=true, description="Vehicle of the driver's trips today; null without trips") String vehicleId,
                       Progress progress, List<TripCard> trips,
                       @Schema(nullable=true, description="The trip to work on now: the first one not completed") TripCard current) {}

    @Schema(name="DriverProgress")
    public record Progress(int stops, int stopsDone, int orders, int ordersDone) {}

    @Schema(name="DriverTripCard")
    public record TripCard(int tripIndex, String vehicleId, String brand, String district, String depot, int planVersion,
                           LocalTime plannedDepart, int stops, int orders, int units, BigDecimal weightKg, BigDecimal volumeM3,
                           BigDecimal distanceKm, int tripMinutes, boolean chilled,
                           @Schema(description="LOADING (not handed over yet), READY, IN_PROGRESS or COMPLETED") String state,
                           @Schema(description="Load task status: pending, loading or loaded") String loadStatus,
                           int stopsDone, int ordersDone,
                           @Schema(description="Orders recorded as partial or failed") int issues,
                           @Schema(nullable=true) Instant startedAt, @Schema(nullable=true) Instant completedAt,
                           @Schema(nullable=true, description="Next stop to serve") String nextOutletId,
                           @Schema(nullable=true, description="Projected arrival at the next stop (planned before the trip starts)") LocalTime nextEta) {}

    @Schema(name="DriverTripDetail")
    public record TripDetail(TripCard card,
                             @Schema(nullable=true, description="Send with every trip action; null before the trip starts") Integer version,
                             @Schema(nullable=true) Integer startedPlanVersion,
                             @Schema(description="The dispatcher published a newer version since the trip started") boolean routeChanged,
                             @Schema(nullable=true, description="Why the trip cannot start yet") String startBlocker,
                             @Schema(nullable=true, description="Sequence of the stop to serve now") Integer currentStopSeq,
                             List<Stop> stops) {}

    @Schema(name="DriverStop")
    public record Stop(int seq, String outletId, String district, String dockType,
                       @Schema(nullable=true) String parkingConstraint,
                       @Schema(nullable=true) LocalTime windowOpen, @Schema(nullable=true) LocalTime windowClose,
                       LocalTime plannedArrival,
                       @Schema(nullable=true, description="Projected arrival, recomputed after each stop; null once arrived") LocalTime eta,
                       @Schema(description="The projected arrival is after the window closes") boolean late,
                       @Schema(description="PENDING, ARRIVED or COMPLETED") String status,
                       @Schema(nullable=true) Instant arrivedAt, @Schema(nullable=true) Instant departedAt,
                       int units, BigDecimal weightKg, boolean chilled, int recorded, List<Order> orders) {}

    @Schema(name="DriverOrder")
    public record Order(long orderId, String orderRef, String temp, int units,
                        @Schema(description="Units that left the depot (fewer when the loader sent the order short)") int loadedUnits,
                        BigDecimal weightKg, BigDecimal volumeM3,
                        @Schema(nullable=true) Outcome outcome) {}

    @Schema(name="DriverOutcome")
    public record Outcome(@Schema(description="DELIVERED, PARTIAL or FAILED") String outcome, int deliveredUnits,
                          @Schema(nullable=true) String issueKind, @Schema(nullable=true) String recipientName,
                          @Schema(nullable=true) String notes, Instant recordedAt, int photos, int signatures) {}

    @Schema(name="DriverDeliveries")
    public record Deliveries(LocalDate planDate, List<DeliveryRow> rows) {}

    @Schema(name="DriverDeliveryRow")
    public record DeliveryRow(int tripIndex, int seq, String outletId, String district, int orders, int units, BigDecimal weightKg,
                              @Schema(description="PENDING, IN_PROGRESS, DELIVERED or ISSUE") String status,
                              @Schema(nullable=true) Instant completedAt, @Schema(nullable=true) LocalTime eta,
                              List<String> orderRefs) {}

    @Schema(name="DriverPastTrip")
    public record PastTrip(LocalDate planDate, int tripIndex, String vehicleId, String brand, String district,
                           int stops, int orders, int delivered, int partial, int failed,
                           Instant startedAt, @Schema(nullable=true) Instant completedAt) {}

    @Schema(name="DriverOrderDetail")
    public record OrderDetail(long orderId, String orderRef, String outletId, String district, String brand, String temp,
                              int units, int loadedUnits, LocalDate planDate, int tripIndex, String vehicleId,
                              @Schema(description="Order status") String status,
                              List<Event> timeline, @Schema(nullable=true) Outcome outcome, List<Proof> proofs) {}

    @Schema(name="DriverEvent")
    public record Event(String label, Instant at) {}

    @Schema(name="DriverProof")
    public record Proof(long id, @Schema(description="PHOTO or SIGNATURE") String kind,
                        @Schema(nullable=true, description="Short-lived link; null when proof storage is not configured") String url,
                        int width, int height, Instant uploadedAt) {}

    @Schema(name="DriverPodUpload")
    public record PodUpload(long id, String kind, int bytes, int width, int height) {}

    @Schema(name="DriverCapabilities")
    public record Capabilities(@Schema(description="Proof photos and signatures can be stored") boolean proofUploads,
                               @Schema(description="Largest accepted upload in bytes") int maxUploadBytes) {}
}
