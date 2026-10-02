package lk.techtrithalon.waypoint.ordering.domain;

import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

/**
 * Sole writer of order status transitions. Illegal moves surface as 409.
 */
public final class OrderStateMachine {
    private OrderStateMachine() {}

    public static OrderStatus confirm(OrderStatus from) {
        if (from != OrderStatus.draft) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_TRANSITION",
                "Only draft orders can be confirmed");
        }
        return OrderStatus.confirmed;
    }

    /** New store orders are created confirmed after review in Phase 4. */
    public static OrderStatus newConfirmed() {
        return OrderStatus.confirmed;
    }
}
