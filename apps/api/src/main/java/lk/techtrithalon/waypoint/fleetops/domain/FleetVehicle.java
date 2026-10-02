package lk.techtrithalon.waypoint.fleetops.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Vehicle plus demo-day availability for fleet list/detail screens. */
public record FleetVehicle(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String vehicleId,
    String type,
    String temp,
    BigDecimal weightCapKg,
    BigDecimal volumeCapM3,
    String fuelType,
    BigDecimal kmPerL,
    BigDecimal weeklyFuelQuotaL,
    String depot,
    LocalDate date,
    @Schema(nullable = true) String availabilityStatus,
    @Schema(nullable = true) String availabilityNote,
    long availabilityVersion,
    boolean availabilityRecorded
) {}
