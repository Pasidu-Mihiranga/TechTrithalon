package lk.techtrithalon.waypoint.shared.time;

import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** All business time is Asia/Colombo. Production code takes this Clock instead of calling now() directly. */
@Configuration
public class TimeConfiguration {
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Colombo");

    @Bean
    public Clock businessClock(@Value("${app.demo.clock-instant:}") String demoInstant) {
        return demoInstant.isBlank() ? Clock.system(BUSINESS_ZONE)
            : Clock.fixed(Instant.parse(demoInstant), BUSINESS_ZONE);
    }
}
