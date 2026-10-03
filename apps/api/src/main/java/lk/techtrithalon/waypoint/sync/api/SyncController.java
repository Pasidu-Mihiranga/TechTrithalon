package lk.techtrithalon.waypoint.sync.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.sync.application.SyncService;
import lk.techtrithalon.waypoint.sync.domain.SyncRequest;
import lk.techtrithalon.waypoint.sync.domain.SyncResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** The driver's outbox replay. Always 200 with one result per action; retries are safe. */
@RestController
@RequestMapping("/api/v1/driver/sync")
@SecurityRequirement(name="session")
class SyncController {
    private final SyncService service;
    SyncController(SyncService service) { this.service = service; }

    @PostMapping
    SyncResponse sync(@AuthenticationPrincipal CurrentUser user, @Valid @RequestBody SyncRequest request) {
        return service.sync(user, request.actions());
    }
}
