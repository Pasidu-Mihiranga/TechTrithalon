package lk.techtrithalon.waypoint.sync.infrastructure;

import java.time.Clock;
import java.time.Duration;
import lk.techtrithalon.waypoint.sync.application.SyncCommandRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Retention: the idempotency record of a field action is kept for {@code app.sync.retention} (90 days
 * by default), far longer than any phone stays offline; the delivery itself and its audit trail stay.
 */
@Component
class SyncRetentionJob {
    private static final Logger log = LoggerFactory.getLogger(SyncRetentionJob.class);
    private final SyncCommandRepository commands;
    private final Clock clock;
    private final Duration retention;

    SyncRetentionJob(SyncCommandRepository commands, Clock clock, @Value("${app.sync.retention:P90D}") Duration retention) {
        this.commands = commands; this.clock = clock; this.retention = retention;
    }

    @Scheduled(cron = "${app.sync.purge-cron:0 15 3 * * *}", zone = "Asia/Colombo")
    void purge() {
        int removed = commands.purgeReceivedBefore(clock.instant().minus(retention));
        if (removed > 0) log.info("Purged {} sync commands older than {}", removed, retention);
    }
}
