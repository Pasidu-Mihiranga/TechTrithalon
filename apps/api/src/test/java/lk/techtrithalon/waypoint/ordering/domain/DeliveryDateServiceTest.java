package lk.techtrithalon.waypoint.ordering.domain;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.math.BigDecimal;
import java.util.List;
import lk.techtrithalon.waypoint.ordering.application.DeliveryDateService;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.junit.jupiter.api.Test;

class DeliveryDateServiceTest {
    private final ReferenceService reference = mock(ReferenceService.class);
    private DeliveryDateService service(String instant) {
        return new DeliveryDateService(reference,
            Clock.fixed(Instant.parse(instant), ZoneId.of("Asia/Colombo")));
    }
    private CalendarDay day(String date, boolean operating) {
        return new CalendarDay(LocalDate.parse(date), 2026, 26, operating, false, null, BigDecimal.ZERO, false);
    }
    @Test void exactCutoffMovesDeliveryToFollowingOperatingDay() {
        when(reference.calendar(LocalDate.parse("2026-06-26"), LocalDate.parse("2026-07-17")))
            .thenReturn(List.of(day("2026-06-26", true)));
        when(reference.calendar(LocalDate.parse("2026-06-27"), LocalDate.parse("2026-07-18")))
            .thenReturn(List.of(day("2026-06-27", true)));
        assertThat(service("2026-06-25T10:29:59Z").deliveryDateNow()).isEqualTo("2026-06-26");
        assertThat(service("2026-06-25T10:30:00Z").deliveryDateNow()).isEqualTo("2026-06-27");
    }
    @Test void skipsNonOperatingDaysAndFailsWhenCalendarIsExhausted() {
        when(reference.calendar(any(), any())).thenReturn(List.of(day("2026-06-28", false), day("2026-06-29", false), day("2026-06-30", true)));
        assertThat(service("2026-06-27T04:00:00Z").deliveryDateNow()).isEqualTo("2026-06-30");
        when(reference.calendar(any(), any())).thenReturn(List.of());
        assertThatThrownBy(() -> service("2026-10-02T04:00:00Z").deliveryDateNow())
            .isInstanceOf(ApiException.class).hasMessageContaining("extend the calendar");
    }
}
