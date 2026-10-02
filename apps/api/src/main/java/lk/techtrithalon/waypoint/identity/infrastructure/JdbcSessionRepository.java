package lk.techtrithalon.waypoint.identity.infrastructure;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import lk.techtrithalon.waypoint.identity.application.SessionRepository;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcSessionRepository implements SessionRepository {
    private final JdbcTemplate db;

    JdbcSessionRepository(JdbcTemplate db) { this.db = db; }

    @Override
    public void create(String tokenHash, long userId, Instant createdAt, Instant expiresAt) {
        db.update("INSERT INTO user_session (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
            tokenHash, userId, Timestamp.from(createdAt), Timestamp.from(expiresAt), Timestamp.from(createdAt));
    }

    @Override
    public Optional<CurrentUser> findLiveUser(String tokenHash, Instant now) {
        Optional<CurrentUser> user = db.query("""
            SELECT u.id, u.username, u.display_name, u.role, u.outlet_id, u.depot
              FROM user_session s JOIN app_user u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.active
            """, (rs, i) -> new CurrentUser(rs.getLong("id"), rs.getString("username"), rs.getString("display_name"),
                Role.valueOf(rs.getString("role")), rs.getString("outlet_id"), rs.getString("depot")),
            tokenHash, Timestamp.from(now)).stream().findFirst();
        user.ifPresent(u -> db.update("UPDATE user_session SET last_seen_at = ? WHERE token_hash = ?", Timestamp.from(now), tokenHash));
        return user;
    }

    @Override
    public void revoke(String tokenHash, Instant now) {
        db.update("UPDATE user_session SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL", Timestamp.from(now), tokenHash);
    }

    @Override
    public int deleteExpired(Instant now) {
        return db.update("DELETE FROM user_session WHERE expires_at < ? OR revoked_at < ?", Timestamp.from(now), Timestamp.from(now.minusSeconds(86_400)));
    }
}
