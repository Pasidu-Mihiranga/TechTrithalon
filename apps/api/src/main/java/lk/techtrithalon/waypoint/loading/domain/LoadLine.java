package lk.techtrithalon.waypoint.loading.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;

/** One order on a load task. Quantities are counted per order, in units (no product catalog exists). */
public record LoadLine(long id, long orderId, String orderRef, String outletId, String tempRequirement,
                       int units, BigDecimal weightKg, BigDecimal volumeM3, int stopSeq, int loadSeq,
                       @Schema(description="pending, loaded or short") String status,
                       @Schema(nullable=true, description="Units actually loaded; null while pending") Integer loadedUnits,
                       @Schema(nullable=true) Instant checkedAt,
                       @Schema(description="The count was carried over from the replaced manifest") boolean carried) {}
