package lk.techtrithalon.waypoint.planning.api;

import java.time.LocalDate;
import java.util.List;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * @param planDate delivery day to freeze; defaults to the configured demo operating date
 * @param depot    required when the dispatcher is not scoped to a single depot
 * @param orderIds optional explicit selection; omit or empty to include all confirmed orders
 */
public record CreateSnapshotRequest(
    LocalDate planDate,
    String depot,
    @Size(max = 100000) List<@NotNull @Positive Long> orderIds
) {}
