package lk.techtrithalon.waypoint.planning.api;

import java.time.LocalDate;
import java.util.List;

/**
 * @param planDate delivery day to freeze; defaults to the configured demo operating date
 * @param depot    required when the dispatcher is not scoped to a single depot
 * @param orderIds optional explicit selection; omit or empty to include all confirmed orders
 */
public record CreateSnapshotRequest(
    LocalDate planDate,
    String depot,
    List<Long> orderIds
) {}
