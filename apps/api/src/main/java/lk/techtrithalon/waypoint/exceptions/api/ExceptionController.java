package lk.techtrithalon.waypoint.exceptions.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.time.LocalDate;
import lk.techtrithalon.waypoint.exceptions.application.ExceptionService;
import lk.techtrithalon.waypoint.exceptions.domain.ExceptionViews;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** The dispatcher's exceptions queue for a day and depot. Items are addressed by source type and id. */
@RestController
@RequestMapping("/api/v1/dispatcher/exceptions")
@SecurityRequirement(name="session")
class ExceptionController {
    private final ExceptionService service;
    ExceptionController(ExceptionService service) { this.service = service; }

    @GetMapping
    ExceptionViews.Queue queue(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date,
                               @RequestParam(required=false) String depot) {
        return service.queue(user, date, depot);
    }

    @PostMapping("/{type}/{id}/claim")
    ExceptionViews.Item claim(@AuthenticationPrincipal CurrentUser user, @PathVariable String type, @PathVariable String id,
                              @RequestParam(required=false) LocalDate date, @RequestParam(required=false) String depot) {
        return service.claim(user, date, depot, type, id);
    }

    @PostMapping("/{type}/{id}/resolve")
    ExceptionViews.Item resolve(@AuthenticationPrincipal CurrentUser user, @PathVariable String type, @PathVariable String id,
                                @RequestParam(required=false) LocalDate date, @RequestParam(required=false) String depot,
                                @Valid @RequestBody ExceptionRequests.Resolve request) {
        return service.resolve(user, date, depot, type, id, request.expectedVersion(), request.decision(), request.note());
    }
}
