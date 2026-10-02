package lk.techtrithalon.waypoint.identity.application;

import java.time.Instant;
import java.util.Optional;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;

public interface SessionRepository {
    void create(String tokenHash, long userId, Instant createdAt, Instant expiresAt);

    /** The active user behind a live (not revoked, not expired) session, refreshing its last-seen time. */
    Optional<CurrentUser> findLiveUser(String tokenHash, Instant now);

    void revoke(String tokenHash, Instant now);

    int deleteExpired(Instant now);
}
