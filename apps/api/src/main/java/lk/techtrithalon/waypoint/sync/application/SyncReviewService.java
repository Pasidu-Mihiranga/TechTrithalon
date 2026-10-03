package lk.techtrithalon.waypoint.sync.application;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.sync.domain.SyncReview;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Published read boundary for the dispatcher's exceptions queue: phone actions that need a look.
 * The caller has already limited the drivers to the run (and depot) the dispatcher may see.
 */
@Service
public class SyncReviewService {
    private final SyncCommandRepository commands;

    public SyncReviewService(SyncCommandRepository commands) { this.commands = commands; }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<SyncReview> forDrivers(CurrentUser user, LocalDate date, Collection<Long> driverUserIds) {
        return commands.reviewsFor(date, driverUserIds);
    }
}
