package lk.techtrithalon.waypoint.fleetops.domain;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
public record VehicleAvailability(String vehicleId, LocalDate date, @Schema(nullable = true) String status, @Schema(nullable = true) String note,
    long version, @Schema(nullable = true) Instant updatedAt, @Schema(nullable = true) Long updatedBy, boolean recorded) {}
