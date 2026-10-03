package lk.techtrithalon.waypoint.loading.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * The dock's work for one published trip. Every value is copied at publication, so the manifest
 * never changes under the loader; a republish supersedes the task and creates a new one.
 */
public record LoadTask(long id, long planId, int planVersion, long tripId, LocalDate planDate, String depot,
                       String vehicleId, int tripIndex, String brand, String district, LocalTime plannedDepart,
                       @Schema(nullable=true) Long driverUserId,
                       @Schema(nullable=true) String driverName,
                       @Schema(nullable=true) BigDecimal weightCapKg,
                       @Schema(nullable=true) BigDecimal volumeCapM3,
                       @Schema(description="pending, loading, loaded or superseded") String status,
                       @Schema(nullable=true, description="Task of the replaced version for the same vehicle and trip") Long replacesTaskId,
                       boolean acknowledgementRequired,
                       @Schema(nullable=true) Instant acknowledgedAt,
                       @Schema(nullable=true) Instant startedAt,
                       @Schema(nullable=true, description="When the trip was marked loaded and handed to the driver") Instant loadedAt,
                       int version, Instant createdAt, Instant updatedAt,
                       @Schema(description="In loading order: the last stop is loaded first") List<LoadLine> lines) {
    public LoadTask { lines = List.copyOf(lines); }

    /** Loading may proceed only on the current manifest, after any required acknowledgement. */
    public boolean awaitingAcknowledgement() { return acknowledgementRequired && acknowledgedAt == null; }
}
