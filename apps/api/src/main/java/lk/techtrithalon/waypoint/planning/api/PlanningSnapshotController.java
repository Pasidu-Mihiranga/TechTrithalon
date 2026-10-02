package lk.techtrithalon.waypoint.planning.api;

import java.time.LocalDate;
import java.util.Map;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.planning.application.PlanningSnapshotService;
import lk.techtrithalon.waypoint.planning.domain.PlanningSnapshot;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dispatcher/planning/snapshots")
@SecurityRequirement(name = "session")
class PlanningSnapshotController {
    private final PlanningSnapshotService service;

    PlanningSnapshotController(PlanningSnapshotService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PlanningSnapshot create(
        @AuthenticationPrincipal CurrentUser user,
        @RequestBody(required = false) CreateSnapshotRequest body
    ) {
        CreateSnapshotRequest req = body == null ? new CreateSnapshotRequest(null, null, null) : body;
        return service.create(user, req.planDate(), req.depot(), req.orderIds());
    }

    @GetMapping("/{id}")
    PlanningSnapshot get(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return service.get(user, id);
    }

    @GetMapping
    PlanningSnapshot latest(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date,
        @RequestParam(required = false) String depot
    ) {
        return service.latest(user, date, depot);
    }

    @GetMapping("/{id}/compare")
    Map<String, Object> compare(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return service.compare(user, id);
    }
}
