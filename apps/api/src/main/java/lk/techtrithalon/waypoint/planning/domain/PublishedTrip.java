package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;

/**
 * A trip as frozen at publication: the schedule, distance and fuel it was validated with, the driver
 * it was published to and its load task. Read from the trip/stop rows, never recomputed.
 */
public record PublishedTrip(long tripId, String vehicleId, int tripIndex, String brand, String district,
                            LocalTime plannedDepart, int tripMinutes, BigDecimal distanceKm, BigDecimal fuelLitres,
                            @Schema(nullable=true, description="Null when no active driver account is linked to the vehicle")
                            Long driverUserId,
                            @Schema(nullable=true) String driverName,
                            @Schema(nullable=true) Long loadTaskId,
                            @Schema(nullable=true, description="pending, loading, loaded or superseded") String loadStatus,
                            @Schema(description="Loading shortfalls awaiting the dispatcher") int openLoadingIssues,
                            @Schema(description="A shortfall holds this vehicle at the dock") boolean held,
                            List<Stop> stops) {
    public PublishedTrip { stops = List.copyOf(stops); }

    public PublishedTrip withLoad(Long taskId, String status, int openIssues, boolean isHeld) {
        return new PublishedTrip(tripId, vehicleId, tripIndex, brand, district, plannedDepart, tripMinutes, distanceKm,
            fuelLitres, driverUserId, driverName, taskId, status, openIssues, isHeld, stops);
    }

    public record Stop(long orderId, int seq, LocalTime plannedArrival, LocalTime serviceStart) {}
}
