package lk.techtrithalon.waypoint.receipt.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.receipt.application.ReceiptService;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** The store manager's deliveries and receipts, limited to their own outlet. */
@RestController
@RequestMapping("/api/v1/store")
@SecurityRequirement(name="session")
class StoreReceiptController {
    private final ReceiptService service;
    StoreReceiptController(ReceiptService service) { this.service = service; }

    @GetMapping("/deliveries")
    ReceiptViews.DeliveryList deliveries(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) String phase) {
        return service.deliveries(user, phase);
    }

    @GetMapping("/deliveries/{orderId}")
    ReceiptViews.DeliveryDetail delivery(@AuthenticationPrincipal CurrentUser user, @PathVariable long orderId) {
        return service.delivery(user, orderId);
    }

    @PostMapping("/deliveries/{orderId}/receipt")
    ReceiptViews.DeliveryDetail confirm(@AuthenticationPrincipal CurrentUser user, @PathVariable long orderId) {
        return service.confirm(user, orderId);
    }

    @PostMapping("/deliveries/{orderId}/issue")
    ReceiptViews.DeliveryDetail dispute(@AuthenticationPrincipal CurrentUser user, @PathVariable long orderId,
                                        @Valid @RequestBody ReceiptRequests.Dispute request) {
        return service.dispute(user, orderId, request.kind(), request.affectedUnits(), request.note());
    }

    @GetMapping("/issues")
    List<ReceiptViews.Discrepancy> issues(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) String status) {
        return service.issues(user, status);
    }
}
