package lk.techtrithalon.waypoint.ordering.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.junit.jupiter.api.Test;

class OrderStateMachineTest {
    @Test
    void confirmsDraftOnly() {
        assertThat(OrderStateMachine.confirm(OrderStatus.draft)).isEqualTo(OrderStatus.confirmed);
        assertThat(OrderStateMachine.newConfirmed()).isEqualTo(OrderStatus.confirmed);
        assertThatThrownBy(() -> OrderStateMachine.confirm(OrderStatus.confirmed))
            .isInstanceOf(ApiException.class)
            .extracting(ex -> ((ApiException) ex).code())
            .isEqualTo("INVALID_TRANSITION");
    }
}
