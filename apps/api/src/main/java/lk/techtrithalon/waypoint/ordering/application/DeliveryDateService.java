package lk.techtrithalon.waypoint.ordering.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import lk.techtrithalon.waypoint.ordering.domain.CutoffInfo;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** 16:00 Asia/Colombo cutoff and next operating-day selection for store orders. */
@Service
public class DeliveryDateService {
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Colombo");
    public static final LocalTime CUTOFF = LocalTime.of(16, 0);

    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final Clock clock;

    public DeliveryDateService(ReferenceService reference, ReferenceProperties referenceProperties, Clock clock) {
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.clock = clock;
    }

    public CutoffInfo cutoffInfo() {
        Instant now = clock.instant();
        ZonedDateTime localNow = now.atZone(BUSINESS_ZONE);
        boolean open = localNow.toLocalTime().isBefore(CUTOFF);
        ZonedDateTime nextCutoff = localNow.toLocalDate().atTime(CUTOFF).atZone(BUSINESS_ZONE);
        if (!open) nextCutoff = nextCutoff.plusDays(1);
        LocalDate deliveryDate = deliveryDateFor(localNow);
        long seconds = Math.max(0, nextCutoff.toInstant().getEpochSecond() - now.getEpochSecond());
        return new CutoffInfo(CUTOFF, BUSINESS_ZONE.getId(), now, nextCutoff.toInstant(), seconds, open, deliveryDate);
    }

    /**
     * Before 16:00: first operating day after today. After 16:00: first operating day after tomorrow
     * (the next cutoff's calendar date).
     */
    public LocalDate deliveryDateFor(ZonedDateTime localNow) {
        LocalDate anchor = localNow.toLocalDate();
        if (!localNow.toLocalTime().isBefore(CUTOFF)) {
            anchor = anchor.plusDays(1);
        }
        return firstOperatingAfter(anchor);
    }

    public LocalDate deliveryDateNow() {
        return deliveryDateFor(clock.instant().atZone(BUSINESS_ZONE));
    }

    public LocalDate firstOperatingAfter(LocalDate exclusiveStart) {
        LocalDate from = exclusiveStart.plusDays(1);
        LocalDate to = from.plusDays(21);
        return reference.calendar(from, to).stream()
            .filter(CalendarDay::operating)
            .map(CalendarDay::date)
            .findFirst()
            .orElseGet(() -> fallbackDemoDate(exclusiveStart));
    }

    /**
     * The supplied calendar ends mid-2026. When wall-clock is past that range (local walkthrough),
     * fall back to the configured demo operating date so store ordering remains usable.
     */
    private LocalDate fallbackDemoDate(LocalDate exclusiveStart) {
        LocalDate demo = referenceProperties.demoOperatingDate();
        boolean operating = reference.calendar(demo, demo).stream().anyMatch(CalendarDay::operating);
        if (operating) return demo;
        throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NO_OPERATING_DAY",
            "No operating day is available after " + exclusiveStart);
    }
}
