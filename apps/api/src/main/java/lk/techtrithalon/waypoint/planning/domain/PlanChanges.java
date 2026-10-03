package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * What a plan version changes compared with the published version it revises. Computed by the
 * server from persisted trips and stops; the loader and the confirmation screen read the same result.
 */
public record PlanChanges(long planId, int version,
                          @Schema(nullable=true) Long basePlanId, @Schema(nullable=true) Integer baseVersion,
                          boolean firstVersion, Summary summary, List<OrderChange> orders, List<TripChange> trips) {
    public PlanChanges { orders = List.copyOf(orders); trips = List.copyOf(trips); }

    public record Summary(int added, int removed, int moved, int resequenced, int unchanged,
                          int tripsAdded, int tripsRemoved, int driversChanged) {}

    /** ADDED, REMOVED (now off every trip), MOVED (other vehicle or trip slot), RESEQUENCED or UNCHANGED. */
    public record OrderChange(long orderId, String orderRef, String outletId, String change,
                              @Schema(nullable=true) Placement before, @Schema(nullable=true) Placement after) {}

    public record Placement(String vehicleId, int tripIndex, int seq) {}

    /** ADDED, REMOVED, CHANGED (stops or driver differ) or UNCHANGED, keyed by vehicle and trip slot. */
    public record TripChange(String vehicleId, int tripIndex, String change,
                             @Schema(nullable=true) String driverBefore, @Schema(nullable=true) String driverAfter) {}
}
