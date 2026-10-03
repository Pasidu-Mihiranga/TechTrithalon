package lk.techtrithalon.waypoint.ordering.domain;

import java.math.BigDecimal;

/** Complete confirmed queue totals, independent of table pagination. */
public record PlanningQueueSummary(
    int totalOrders, int ambientOrders, int chilledOrders, int vanOnlyOrders, BigDecimal totalVolumeM3
) {}
