package lk.techtrithalon.waypoint.ordering.api;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

public record PlaceOrderRequest(
    @NotBlank String tempRequirement,
    @NotNull @Min(1) @Max(100_000) Integer units,
    @NotNull @DecimalMax("99999999.99") @DecimalMin(value = "0.01", inclusive = true) BigDecimal weightKg,
    @NotNull @DecimalMax("9999999.999") @DecimalMin(value = "0.001", inclusive = true) BigDecimal volumeM3,
    LocalDate expectedDeliveryDate
) {}
