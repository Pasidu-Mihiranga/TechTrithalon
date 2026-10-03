package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;

/**
 * A fleet vehicle evaluated during planning.
 */
public record PlanVehicle(
    String vehicleId,
    String type,
    String temp,
    BigDecimal weightCapKg,
    BigDecimal volumeCapM3,
    String depot,
    BigDecimal kmPerL,
    BigDecimal weeklyFuelQuotaL,
    String availabilityStatus
) {}
