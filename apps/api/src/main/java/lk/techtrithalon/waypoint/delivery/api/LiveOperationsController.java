package lk.techtrithalon.waypoint.delivery.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.LocalDate;
import lk.techtrithalon.waypoint.delivery.application.LiveBoardService;
import lk.techtrithalon.waypoint.delivery.domain.LiveViews;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Live Operations: where every published trip of a run stands (the page polls this). */
@RestController
@RequestMapping("/api/v1/dispatcher/live-operations")
@SecurityRequirement(name="session")
class LiveOperationsController {
    private final LiveBoardService service;
    LiveOperationsController(LiveBoardService service) { this.service = service; }

    @GetMapping
    LiveViews.Board board(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date,
                          @RequestParam(required=false) String depot) {
        return service.board(user, date, depot);
    }
}
