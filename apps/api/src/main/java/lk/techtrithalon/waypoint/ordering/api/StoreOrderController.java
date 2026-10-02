package lk.techtrithalon.waypoint.ordering.api;

import java.time.LocalDate;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.OrderCommandService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CutoffInfo;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
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
@RequestMapping("/api/v1/store")
@SecurityRequirement(name = "session")
class StoreOrderController {
    private final OrderQueryService queries;
    private final OrderCommandService commands;

    StoreOrderController(OrderQueryService queries, OrderCommandService commands) {
        this.queries = queries;
        this.commands = commands;
    }

    @GetMapping("/cutoff")
    CutoffInfo cutoff(@AuthenticationPrincipal CurrentUser user) {
        return queries.cutoff(user);
    }

    @GetMapping("/orders")
    OrderPage orders(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam(required = false) LocalDate date,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String q,
        @RequestParam(defaultValue = "orderDate") String sort,
        @RequestParam(defaultValue = "false") boolean asc,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "50") int size
    ) {
        return queries.storeOrders(user, date, status, q, sort, asc, page, size);
    }

    @GetMapping("/orders/{id}")
    CustomerOrder order(@AuthenticationPrincipal CurrentUser user, @PathVariable long id) {
        return queries.storeOrder(user, id);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    CustomerOrder place(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody PlaceOrderRequest request
    ) {
        return commands.placeConfirmed(
            user, request.tempRequirement(), request.units(), request.weightKg(), request.volumeM3()
        );
    }
}
