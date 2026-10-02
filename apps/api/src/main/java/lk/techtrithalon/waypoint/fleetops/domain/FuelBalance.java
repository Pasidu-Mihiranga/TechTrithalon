package lk.techtrithalon.waypoint.fleetops.domain;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
public record FuelBalance(String vehicleId, int isoYear, int isoWeek, BigDecimal quotaLitres,
    @Schema(nullable = true) BigDecimal committedLitres, @Schema(nullable = true) BigDecimal actualLitres, @Schema(nullable = true) BigDecimal remainingLitres, boolean recorded) {}
