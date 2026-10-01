package lk.techtrithalon.waypoint.reference.domain;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
public record Vehicle(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String vehicleId, String type, String temp, BigDecimal weightCapKg, BigDecimal volumeCapM3,
    String fuelType, BigDecimal kmPerL, BigDecimal weeklyFuelQuotaL, String depot) {}
