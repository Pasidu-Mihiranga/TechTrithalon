package lk.techtrithalon.waypoint.ordering.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/** Store-manager cutoff clock. Times are computed server-side in Asia/Colombo. */
public record CutoffInfo(
    LocalTime cutoffLocalTime,
    String timeZone,
    Instant serverNow,
    Instant nextCutoffAt,
    long secondsRemaining,
    boolean open,
    LocalDate nextDeliveryDate
) {}
