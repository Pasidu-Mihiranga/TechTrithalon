package lk.techtrithalon.waypoint.fleetops.api;

import java.time.LocalDate;
import java.util.List;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.fleetops.domain.FleetVehicle;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dispatcher/fleet")
@SecurityRequirement(name = "session")
class FleetReadController {
    private final FleetService service;
    private final ReferenceProperties reference;

    FleetReadController(FleetService service, ReferenceProperties reference) {
        this.service = service;
        this.reference = reference;
    }

    @GetMapping
    List<FleetVehicle> fleet(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date,
        @RequestParam(required = false) String depot
    ) {
        return service.fleet(user, date == null ? reference.demoOperatingDate() : date, depot);
    }

    @GetMapping("/{vehicleId}")
    FleetVehicle vehicle(
        @AuthenticationPrincipal CurrentUser user,
        @PathVariable String vehicleId,
        @RequestParam(required = false) LocalDate date
    ) {
        return service.fleetVehicle(user, vehicleId, date == null ? reference.demoOperatingDate() : date);
    }
}
