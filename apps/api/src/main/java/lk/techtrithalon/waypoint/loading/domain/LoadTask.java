package lk.techtrithalon.waypoint.loading.domain;

import io.swagger.v3.oas.annotations.media.Schema;
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
                       @Schema(description="pending, loading, loaded or superseded") String status,
                       int version, Instant createdAt, Instant updatedAt,
                       @Schema(description="In loading order: the last stop is loaded first") List<LoadLine> lines) {
    public LoadTask { lines = List.copyOf(lines); }
}
