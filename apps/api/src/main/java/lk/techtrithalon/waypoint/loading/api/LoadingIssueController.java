package lk.techtrithalon.waypoint.loading.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadingIssueService;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/dispatcher/loading-issues")
@SecurityRequirement(name="session")
class LoadingIssueController {
    private final LoadingIssueService service;
    LoadingIssueController(LoadingIssueService service) { this.service = service; }

    @GetMapping
    List<LoadingIssue> list(@AuthenticationPrincipal CurrentUser user, @RequestParam LocalDate date,
                            @RequestParam(required=false) String depot, @RequestParam(required=false) String status) {
        return service.forRun(user, date, depot, status);
    }

    @PostMapping("/{id}/resolve")
    LoadingIssue resolve(@AuthenticationPrincipal CurrentUser user, @PathVariable long id,
                         @Valid @RequestBody LoaderRequests.Decision request) {
        return service.resolve(user, id, request.expectedVersion(), request.decision(), request.note());
    }
}
