package lk.techtrithalon.waypoint.loading.domain;

import java.math.BigDecimal;

/** One order on a load task. Quantities are counted per order, in units (no product catalog exists). */
public record LoadLine(long id, long orderId, String orderRef, String outletId, String tempRequirement,
                       int units, BigDecimal weightKg, BigDecimal volumeM3, int stopSeq, int loadSeq, String status) {}
