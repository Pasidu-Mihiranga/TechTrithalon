package lk.techtrithalon.waypoint.identity.infrastructure;

import java.time.Clock;
import lk.techtrithalon.waypoint.identity.application.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Removes expired and long-revoked sessions so the table does not grow forever. */
@Component
class SessionCleanup {
    private static final Logger log = LoggerFactory.getLogger(SessionCleanup.class);
    private final SessionRepository sessions;
    private final Clock clock;

    SessionCleanup(SessionRepository sessions, Clock clock) {
        this.sessions = sessions;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    void purge() {
        int removed = sessions.deleteExpired(clock.instant());
        if (removed > 0) log.info("Removed {} expired sessions", removed);
    }
}
