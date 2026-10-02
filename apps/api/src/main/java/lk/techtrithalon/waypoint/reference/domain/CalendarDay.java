package lk.techtrithalon.waypoint.reference.domain;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.math.BigDecimal;
public record CalendarDay(LocalDate date, int isoYear, int isoWeek, boolean operating, boolean payday,
    @Schema(nullable = true) String festival, BigDecimal festivalRamp, boolean monsoon) {}
