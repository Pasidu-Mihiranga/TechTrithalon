package lk.techtrithalon.waypoint.planning.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import java.time.LocalDate;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.planning.application.DeferralService;
import lk.techtrithalon.waypoint.planning.domain.DeferralRecord;
import lk.techtrithalon.waypoint.planning.domain.DeferralRun;
import lk.techtrithalon.waypoint.planning.domain.OrderFairness;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@SecurityRequirement(name="session")
class DeferralController {
    private final DeferralService service;
    DeferralController(DeferralService service) { this.service=service; }

    /** Deferrals published for one planning run, with the orders' current status. */
    @GetMapping("/api/v1/dispatcher/deferrals")
    DeferralRun forRun(@AuthenticationPrincipal CurrentUser user,@RequestParam LocalDate date,
                                @RequestParam(required=false) String depot) {
        return service.forRun(user,date,depot);
    }

    /** Repeat-skip evidence for specific orders in a run, derived from deferral history and imported facts. */
    @GetMapping("/api/v1/dispatcher/deferrals/fairness")
    List<OrderFairness> fairness(@AuthenticationPrincipal CurrentUser user,@RequestParam LocalDate date,
                                 @RequestParam List<Long> orderIds) {
        return service.fairnessForOrders(user,date,orderIds);
    }

    /** Deferral notices for the store manager's own outlet, newest first. */
    @GetMapping("/api/v1/store/deferrals")
    List<DeferralRecord> storeNotices(@AuthenticationPrincipal CurrentUser user) { return service.storeNotices(user); }

    @PostMapping("/api/v1/store/deferrals/{id}/acknowledge")
    DeferralRecord acknowledge(@AuthenticationPrincipal CurrentUser user,@PathVariable long id) {
        return service.acknowledge(user,id);
    }
}
