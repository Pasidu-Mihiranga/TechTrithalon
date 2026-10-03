package lk.techtrithalon.waypoint.planning.domain;

import java.time.LocalTime;

/**
 * A scheduled delivery stop on a trip.
 */
public record PlanStop(
    long id,
    long orderId,
    int stopIndex,
    PlanOrder order,
    LocalTime plannedArrival,
    LocalTime serviceStart
) {}
