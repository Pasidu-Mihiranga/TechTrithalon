package lk.techtrithalon.waypoint.planning.domain;

import java.time.LocalTime;

/**
 * Operating and budget constraint parameters for a planning session.
 */
public record PlanConstraintParams(
    int maxTripsPerVehicleDay,
    int freshBudgetMinutes,
    int otherBudgetMinutes,
    LocalTime freshBudgetStart,
    LocalTime freshBudgetEnd,
    LocalTime otherBudgetStart,
    LocalTime otherBudgetEnd
) {
    public static PlanConstraintParams standard() {
        return new PlanConstraintParams(
            2,
            270,
            480,
            LocalTime.of(3, 30),
            LocalTime.of(8, 0),
            LocalTime.of(8, 0),
            LocalTime.of(16, 0)
        );
    }
}
