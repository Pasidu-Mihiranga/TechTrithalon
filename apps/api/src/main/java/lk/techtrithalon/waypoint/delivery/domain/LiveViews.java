package lk.techtrithalon.waypoint.delivery.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** The dispatcher's live board: every published trip of a run and where it stands on the road. */
public final class LiveViews {
    private LiveViews() {}

    @Schema(name="LiveBoard")
    public record Board(LocalDate date, String depot,
                        @Schema(description="Server time of this snapshot; ages are measured against it") Instant asOf,
                        Counts counts, List<Vehicle> vehicles) {}

    @Schema(name="LiveCounts")
    public record Counts(int total, int loading, int ready, int inTransit, int delayed, int completed) {
        public static final Counts NONE = new Counts(0, 0, 0, 0, 0, 0);
        public Counts plus(Counts o) {
            return new Counts(total + o.total, loading + o.loading, ready + o.ready, inTransit + o.inTransit, delayed + o.delayed, completed + o.completed);
        }
        /** Trips on the road: started and not finished (delayed ones included). */
        public int active() { return inTransit + delayed; }
    }

    @Schema(name="LiveVehicle")
    public record Vehicle(String vehicleId, int tripIndex, String brand, String district, @Schema(nullable=true) String driverName,
                          @Schema(description="LOADING, READY, IN_TRANSIT, DELAYED or COMPLETED") String state,
                          int planVersion, @Schema(nullable=true) LocalTime plannedDepart,
                          @Schema(nullable=true) Instant startedAt, @Schema(nullable=true) Instant completedAt,
                          int stops, int stopsDone,
                          @Schema(nullable=true, description="1-based position of the stop being served or next") Integer currentStopSeq,
                          @Schema(nullable=true) String currentOutletId,
                          @Schema(nullable=true, description="ARRIVED when the driver is at the stop, EN_ROUTE when heading there") String currentStopState,
                          @Schema(nullable=true, description="Projected arrival at the current stop (same projection as the driver's screen)") LocalTime currentEta,
                          int orders, int ordersDone, @Schema(description="Orders recorded as partial or failed") int issues,
                          @Schema(description="Latest recorded activity on the trip") Instant lastUpdateAt,
                          @Schema(description="Whole minutes between the last activity and the snapshot, never negative") long minutesAgo,
                          List<StopMark> stopMarks) {}

    @Schema(name="LiveStopMark")
    public record StopMark(int seq, String outletId, @Schema(description="PENDING, ARRIVED or COMPLETED") String status,
                           @Schema(description="Projected arrival is after the window closes") boolean late) {}
}
