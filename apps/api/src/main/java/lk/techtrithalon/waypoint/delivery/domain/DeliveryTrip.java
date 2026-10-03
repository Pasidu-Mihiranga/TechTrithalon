package lk.techtrithalon.waypoint.delivery.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;

/** A trip the driver is running or has finished. One per vehicle, trip slot and day, across plan versions. */
public record DeliveryTrip(long id, LocalDate planDate, String depot, String vehicleId, int tripIndex, long driverUserId,
                           int startedPlanVersion,
                           @Schema(description="in_progress or completed") String status,
                           Instant startedAt, @Schema(nullable=true) Instant completedAt, int version) {}
