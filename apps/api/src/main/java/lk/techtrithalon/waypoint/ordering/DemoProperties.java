package lk.techtrithalon.waypoint.ordering;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Local demo-day seed from the supplied peak-day CSVs. Paths stay outside the repository; expected
 * counts default to the real S1 fixture and are overridden for synthetic CI fixtures.
 */
@ConfigurationProperties("app.demo")
public record DemoProperties(
    boolean seedOnStartup,
    String dataDir,
    int expectedOrders,
    int expectedFleetRows
) {}
