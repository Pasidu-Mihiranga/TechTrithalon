package lk.techtrithalon.waypoint.fleetops.api;
import java.time.LocalDate;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.fleetops.domain.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/dispatcher/vehicles/{id}")
@SecurityRequirement(name="session")
class FleetController {
    private final FleetService service;
    FleetController(FleetService service) { this.service=service; }
    @GetMapping("/availability") VehicleAvailability availability(@AuthenticationPrincipal CurrentUser user,@PathVariable String id,@RequestParam LocalDate date) { return service.availability(user,id,date); }
    @PatchMapping("/availability") VehicleAvailability update(@AuthenticationPrincipal CurrentUser user,@PathVariable String id,@Valid @RequestBody AvailabilityRequest request) { return service.update(user,id,request.date(),request.status(),request.note(),request.expectedVersion()); }
    @GetMapping("/fuel") FuelBalance fuel(@AuthenticationPrincipal CurrentUser user,@PathVariable String id,@RequestParam LocalDate date) { return service.fuel(user,id,date); }
}
