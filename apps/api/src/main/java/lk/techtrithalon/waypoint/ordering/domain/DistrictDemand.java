package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

/** The planning queue grouped by district; every figure is computed from the complete queue, not a page. */
public record DistrictDemand(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String district,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int orders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int ambientOrders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int chilledOrders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int vanOnlyOrders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int carriedOrders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal volumeM3
) {}
