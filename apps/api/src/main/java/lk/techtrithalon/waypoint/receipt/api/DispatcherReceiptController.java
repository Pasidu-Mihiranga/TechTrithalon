package lk.techtrithalon.waypoint.receipt.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.receipt.application.ReceiptService;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Disputed deliveries for the dispatcher to decide. */
@RestController
@RequestMapping("/api/v1/dispatcher/receipt-discrepancies")
@SecurityRequirement(name="session")
class DispatcherReceiptController {
    private final ReceiptService service;
    DispatcherReceiptController(ReceiptService service) { this.service = service; }

    @GetMapping
    List<ReceiptViews.Discrepancy> list(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) String depot,
                                        @RequestParam(required=false) String status) {
        return service.discrepancies(user, depot, status);
    }

    @PostMapping("/{id}/resolve")
    ReceiptViews.Discrepancy resolve(@AuthenticationPrincipal CurrentUser user, @PathVariable long id,
                                     @Valid @RequestBody ReceiptRequests.Decision request) {
        return service.resolve(user, id, request.expectedVersion(), request.decision(), request.note());
    }
}
