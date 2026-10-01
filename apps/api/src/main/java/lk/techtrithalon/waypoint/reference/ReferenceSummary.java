package lk.techtrithalon.waypoint.reference;

import java.time.LocalDate;

public record ReferenceSummary(
    int outlets,
    int vehicles,
    int calendarDays,
    int districts,
    int serviceAllowances,
    LocalDate demoOperatingDate
) {}
