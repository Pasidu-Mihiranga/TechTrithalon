package lk.techtrithalon.waypoint.fleetops.api;
import java.time.LocalDate;
import jakarta.validation.constraints.*;
public record AvailabilityRequest(@NotNull LocalDate date, @NotBlank @Pattern(regexp="available|in_workshop") String status,
    @NotBlank @Size(max=500) String note, @NotNull @Min(0) Long expectedVersion) {}
