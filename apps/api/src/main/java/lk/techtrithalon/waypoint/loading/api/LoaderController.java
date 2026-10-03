package lk.techtrithalon.waypoint.loading.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoaderService;
import lk.techtrithalon.waypoint.loading.domain.LoaderViews;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/loader")
@SecurityRequirement(name="session")
class LoaderController {
    private final LoaderService service;
    LoaderController(LoaderService service) { this.service = service; }

    /** Trips, counts and open issues for the loader's depot on a planning run (default: the demo operating day). */
    @GetMapping("/board")
    LoaderViews.Board board(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date) {
        return service.board(user, date);
    }

    @GetMapping("/load-tasks/{id}")
    LoaderViews.Detail task(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) { return service.detail(user, id); }

    @PostMapping("/load-tasks/{id}/acknowledge")
    LoaderViews.Detail acknowledge(@AuthenticationPrincipal CurrentUser user, @PathVariable long id,
                                   @Valid @RequestBody LoaderRequests.Command request) {
        return service.acknowledge(user, id, request.expectedVersion());
    }

    @PostMapping("/load-tasks/{id}/lines/{lineId}/loaded")
    LoaderViews.Detail confirmLine(@AuthenticationPrincipal CurrentUser user, @PathVariable long id, @PathVariable long lineId,
                                   @Valid @RequestBody LoaderRequests.Command request) {
        return service.confirmLine(user, id, lineId, request.expectedVersion());
    }

    @PostMapping("/load-tasks/{id}/lines/{lineId}/shortfall")
    LoaderViews.Detail shortfall(@AuthenticationPrincipal CurrentUser user, @PathVariable long id, @PathVariable long lineId,
                                 @Valid @RequestBody LoaderRequests.Shortfall request) {
        return service.reportShortfall(user, id, lineId, request.expectedVersion(), request.kind(), request.shortUnits(),
            request.note(), request.holdsVehicle());
    }

    @PostMapping("/load-tasks/{id}/loaded")
    LoaderViews.Detail markLoaded(@AuthenticationPrincipal CurrentUser user, @PathVariable long id,
                                  @Valid @RequestBody LoaderRequests.Command request) {
        return service.markLoaded(user, id, request.expectedVersion());
    }

    @GetMapping("/issues")
    List<LoadingIssue> issues(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date,
                              @RequestParam(required=false) String status) {
        return service.issues(user, date, status);
    }
}
