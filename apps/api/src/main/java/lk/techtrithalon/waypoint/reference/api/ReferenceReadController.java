package lk.techtrithalon.waypoint.reference.api;
import java.time.LocalDate;
import java.util.List;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/reference")
@SecurityRequirement(name="session")
class ReferenceReadController {
    private final ReferenceService service;
    ReferenceReadController(ReferenceService service) { this.service=service; }
    @GetMapping("/outlets") List<Outlet> outlets(@AuthenticationPrincipal CurrentUser user,@RequestParam(required=false) String brand,@RequestParam(required=false) String district) { return service.outlets(user,brand,district); }
    @GetMapping("/outlets/{id}") Outlet outlet(@AuthenticationPrincipal CurrentUser user,@PathVariable String id) { return service.outlet(user,id); }
    @GetMapping("/vehicles") List<Vehicle> vehicles(@AuthenticationPrincipal CurrentUser user) { return service.vehicles(user); }
    @GetMapping("/vehicles/{id}") Vehicle vehicle(@AuthenticationPrincipal CurrentUser user,@PathVariable String id) { return service.vehicle(user,id); }
    @GetMapping("/districts") List<DistrictTravel> districts(@AuthenticationPrincipal CurrentUser user) { return service.districts(user); }
    @GetMapping("/depots") List<String> depots(@AuthenticationPrincipal CurrentUser user) { return service.depots(user); }
    @GetMapping("/service-allowances") List<ServiceAllowance> allowances(@AuthenticationPrincipal CurrentUser user) { return service.allowances(user); }
    @GetMapping("/calendar") List<CalendarDay> calendar(@RequestParam LocalDate from,@RequestParam LocalDate to) { return service.calendar(from,to); }
}
