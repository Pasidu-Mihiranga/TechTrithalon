package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;

/**
 * Summary metrics computed for a candidate or published plan.
 */
public record PlanMetrics(
    int ordersAssigned,
    int ordersUnassigned,
    int vehiclesUsed,
    int tripsUsed,
    BigDecimal totalDistanceKm,
    BigDecimal totalFuelLitres,
    BigDecimal avgVolumeUtilisation,
    BigDecimal avgWeightUtilisation,
    int hardViolationCount,
    BigDecimal assignedVolumeM3,
    int availableVehicles,
    int totalOrders,
    BigDecimal totalOrderVolumeM3
) {}
