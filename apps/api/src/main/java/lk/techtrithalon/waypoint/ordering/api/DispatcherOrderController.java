package lk.techtrithalon.waypoint.ordering.api;

import java.time.LocalDate;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.DashboardSnapshot;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dispatcher")
@SecurityRequirement(name = "session")
class DispatcherOrderController {
    private final OrderQueryService service;

    DispatcherOrderController(OrderQueryService service) { this.service = service; }

    @GetMapping("/dashboard")
    DashboardSnapshot dashboard(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date
    ) {
        return service.dashboard(user, date);
    }

    @GetMapping("/orders")
    OrderPage orders(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date,
        @RequestParam(required = false) String brand,
        @RequestParam(required = false) String tempRequirement,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "ref") String sort,
        @RequestParam(defaultValue = "true") boolean asc,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        return service.dispatcherOrders(user, date, brand, tempRequirement, status, q, sort, asc, page, size);
    }

    @GetMapping("/orders/{id}")
    CustomerOrder order(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return service.dispatcherOrder(user, id);
    }
}
