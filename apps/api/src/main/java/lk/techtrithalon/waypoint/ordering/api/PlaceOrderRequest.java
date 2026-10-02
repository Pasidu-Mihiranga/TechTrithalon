package lk.techtrithalon.waypoint.ordering.api;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record PlaceOrderRequest(
    @NotBlank String tempRequirement,
    @NotNull @Min(1) @Max(100_000) Integer units,
    @NotNull @DecimalMin(value = "0.01", inclusive = true) BigDecimal weightKg,
    @NotNull @DecimalMin(value = "0.001", inclusive = true) BigDecimal volumeM3
) {}
