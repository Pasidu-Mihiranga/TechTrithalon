package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record CustomerOrder(
    long id,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String ref,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String outletId,
    String brand,
    String depot,
    String district,
    LocalDate orderDate,
    Instant placedAt,
    @Schema(nullable = true) Instant confirmedAt,
    String tempRequirement,
    int units,
    BigDecimal weightKg,
    BigDecimal volumeM3,
    String status,
    int isoYear,
    int isoWeek,
    @Schema(nullable = true) Long placedBy,
    int version,
    @Schema(description = "Planning run the order belongs to; later than orderDate after a published deferral")
    LocalDate planningDate,
    @Schema(nullable = true, description = "Deferred-yesterday flag supplied with imported scenario data")
    Boolean sourceDeferredYesterday,
    @Schema(nullable = true, description = "Days since last served, supplied with imported scenario data")
    Integer sourceDaysSinceServed
) {}
