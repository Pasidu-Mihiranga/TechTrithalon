package lk.techtrithalon.waypoint.planning.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.planning.application.ManualPlanService;
import lk.techtrithalon.waypoint.planning.domain.ManualPlanView;
import lk.techtrithalon.waypoint.planning.domain.PlanChanges;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/dispatcher/plans")
@SecurityRequirement(name="session")
class ManualPlanController {
    private final ManualPlanService service;
    ManualPlanController(ManualPlanService service) { this.service=service; }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    ManualPlanView create(@AuthenticationPrincipal CurrentUser user,@Valid @RequestBody ManualPlanRequests.Create request) {
        return service.create(user,request.snapshotId(),request.reason(),request.startFrom());
    }
    @GetMapping("/{id}")
    ManualPlanView get(@AuthenticationPrincipal CurrentUser user,@PathVariable long id) { return service.get(user,id); }
    @GetMapping
    List<ManualPlanView> list(@AuthenticationPrincipal CurrentUser user,@RequestParam LocalDate date,
                              @RequestParam(required=false) String depot) { return service.list(user,date,depot); }
    @PutMapping("/{id}")
    ManualPlanView replace(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@Valid @RequestBody ManualPlanRequests.Replace request) {
        return service.replace(user,id,request);
    }
    @PostMapping("/{id}/trips")
    ManualPlanView addTrip(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@Valid @RequestBody ManualPlanRequests.AddTrip request) {
        return service.addTrip(user,id,request);
    }
    @DeleteMapping("/{id}/trips/{tripId}")
    ManualPlanView removeTrip(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@PathVariable long tripId,
                              @Valid @RequestBody ManualPlanRequests.Command request) { return service.removeTrip(user,id,tripId,request); }
    @PostMapping("/{id}/moves")
    ManualPlanView move(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@Valid @RequestBody ManualPlanRequests.Move request) {
        return service.move(user,id,request);
    }
    @PostMapping("/{id}/trips/{tripId}/vehicle")
    ManualPlanView vehicle(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@PathVariable long tripId,
                           @Valid @RequestBody ManualPlanRequests.Vehicle request) { return service.vehicle(user,id,tripId,request); }
    @PostMapping("/{id}/trips/{tripId}/sequence")
    ManualPlanView sequence(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@PathVariable long tripId,
                            @Valid @RequestBody ManualPlanRequests.Sequence request) { return service.sequence(user,id,tripId,request); }
    @PostMapping("/{id}/orders/{orderId}/defer")
    ManualPlanView defer(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@PathVariable long orderId,
                         @Valid @RequestBody ManualPlanRequests.Defer request) { return service.defer(user,id,orderId,request,false); }
    @PostMapping("/{id}/orders/{orderId}/restore")
    ManualPlanView restore(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@PathVariable long orderId,
                           @Valid @RequestBody ManualPlanRequests.Defer request) { return service.defer(user,id,orderId,request,true); }
    @GetMapping("/{id}/changes")
    PlanChanges changes(@AuthenticationPrincipal CurrentUser user,@PathVariable long id) { return service.changes(user,id); }
    @PostMapping("/{id}/publish")
    ManualPlanView publish(@AuthenticationPrincipal CurrentUser user,@PathVariable long id,@Valid @RequestBody ManualPlanRequests.Command request) {
        return service.publish(user,id,request);
    }
}
