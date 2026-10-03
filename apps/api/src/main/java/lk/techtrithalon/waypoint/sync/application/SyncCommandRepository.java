package lk.techtrithalon.waypoint.sync.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lk.techtrithalon.waypoint.sync.domain.SyncAction;
import lk.techtrithalon.waypoint.sync.domain.SyncResult;
import lk.techtrithalon.waypoint.sync.domain.SyncReview;

public interface SyncCommandRepository {
    /** The stored result of an action already received, with the user who sent it. */
    record Stored(long userId, SyncResult result) {}

    Optional<Stored> find(UUID clientActionId);
    /**
     * Claims the id inside the caller's transaction; false when it is already stored. The dedupe is
     * this insert: a concurrent retry of the same id waits on the key and then sees it taken.
     */
    boolean claim(long userId, SyncAction action, String payloadJson, Instant receivedAt, boolean clockSkew);
    void saveResult(UUID clientActionId, SyncResult result);
    /** Actions of these users on a day that conflicted, were rejected, or were applied with a route review reason. */
    List<SyncReview> reviewsFor(LocalDate date, Collection<Long> userIds);
    int purgeReceivedBefore(Instant cutoff);
}
