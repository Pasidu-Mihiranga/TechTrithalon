package lk.techtrithalon.waypoint.reference;

import java.time.LocalDate;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param dataDir           directory holding the five operational reference CSVs
 * @param seedOnStartup     import reference data when the API starts (idempotent)
 * @param demoOperatingDate the seeded delivery day used by the walkthrough; must be an operating day
 * @param expected          row counts the import must produce; defaults are the supplied dataset's
 */
@ConfigurationProperties("app.reference")
public record ReferenceProperties(
    String dataDir,
    boolean seedOnStartup,
    LocalDate demoOperatingDate,
    ExpectedCounts expected
) {
    public record ExpectedCounts(int outlets, int vehicles, int calendarDays, int districts, int serviceAllowances) {}
}
