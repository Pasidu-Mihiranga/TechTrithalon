package lk.techtrithalon.waypoint.reference.domain;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalTime;
public record Outlet(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String outletId, String brand, String district, String depot, String dockType,
    String parkingConstraint, LocalTime windowOpen, LocalTime windowClose,
    @Schema(nullable = true) LocalTime mallWindowOpen, @Schema(nullable = true) LocalTime mallWindowClose, LocalTime effectiveWindowOpen, LocalTime effectiveWindowClose) {}
