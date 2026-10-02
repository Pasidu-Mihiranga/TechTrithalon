package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.time.LocalTime;

/**
 * An order considered during delivery planning.
 */
public record PlanOrder(
    long id,
    String orderRef,
    String outletId,
    String brand,
    String temp,
    BigDecimal volumeM3,
    BigDecimal weightKg,
    String district,
    String depot,
    String dockType,
    String parkingConstraint,
    LocalTime effectiveWindowOpen,
    LocalTime effectiveWindowClose
) {}
