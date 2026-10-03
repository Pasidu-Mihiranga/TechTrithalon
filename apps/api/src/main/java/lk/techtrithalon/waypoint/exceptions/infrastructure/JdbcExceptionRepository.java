package lk.techtrithalon.waypoint.exceptions.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import lk.techtrithalon.waypoint.exceptions.application.ExceptionRepository;
import lk.techtrithalon.waypoint.exceptions.domain.OperationalException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcExceptionRepository implements ExceptionRepository {
    private final JdbcTemplate db;

    JdbcExceptionRepository(JdbcTemplate db) { this.db = db; }

    public List<OperationalException> find(String sourceType, Collection<String> sourceIds) {
        if (sourceIds.isEmpty()) return List.of();
        return db.query("SELECT * FROM operational_exception WHERE source_type=? AND source_id = ANY(?)", this::map,
            sourceType, (Object) sourceIds.toArray(String[]::new));
    }

    public boolean claim(String sourceType, String sourceId, long actor, String actorName, Instant at) {
        Timestamp now = Timestamp.from(at);
        return db.update("""
            INSERT INTO operational_exception(source_type,source_id,status,claimed_by,claimed_by_name,claimed_at,created_at,updated_at)
            VALUES(?,?,'IN_PROGRESS',?,?,?,?,?)
            ON CONFLICT (source_type,source_id) DO UPDATE
               SET status='IN_PROGRESS', claimed_by=EXCLUDED.claimed_by, claimed_by_name=EXCLUDED.claimed_by_name,
                   claimed_at=EXCLUDED.claimed_at, version=operational_exception.version+1, updated_at=EXCLUDED.updated_at
             WHERE operational_exception.status <> 'RESOLVED'
            """, sourceType, sourceId, actor, actorName, now, now, now) == 1;
    }

    public boolean resolve(String sourceType, String sourceId, int expectedVersion, long actor, String actorName, String note, Instant at) {
        Timestamp now = Timestamp.from(at);
        if (expectedVersion == 0) {
            return db.update("""
                INSERT INTO operational_exception(source_type,source_id,status,resolved_by,resolved_by_name,resolved_at,note,created_at,updated_at)
                VALUES(?,?,'RESOLVED',?,?,?,?,?,?) ON CONFLICT (source_type,source_id) DO NOTHING
                """, sourceType, sourceId, actor, actorName, now, note, now, now) == 1;
        }
        return db.update("""
            UPDATE operational_exception SET status='RESOLVED', resolved_by=?, resolved_by_name=?, resolved_at=?, note=?,
                   version=version+1, updated_at=?
            WHERE source_type=? AND source_id=? AND version=? AND status <> 'RESOLVED'
            """, actor, actorName, now, note, now, sourceType, sourceId, expectedVersion) == 1;
    }

    public void markResolved(String sourceType, String sourceId, long actor, String actorName, String note, Instant at) {
        Timestamp now = Timestamp.from(at);
        db.update("""
            INSERT INTO operational_exception(source_type,source_id,status,resolved_by,resolved_by_name,resolved_at,note,created_at,updated_at)
            VALUES(?,?,'RESOLVED',?,?,?,?,?,?)
            ON CONFLICT (source_type,source_id) DO UPDATE
               SET status='RESOLVED', resolved_by=EXCLUDED.resolved_by, resolved_by_name=EXCLUDED.resolved_by_name,
                   resolved_at=EXCLUDED.resolved_at, note=EXCLUDED.note, version=operational_exception.version+1, updated_at=EXCLUDED.updated_at
            """, sourceType, sourceId, actor, actorName, now, note, now, now);
    }

    private OperationalException map(ResultSet rs, int i) throws SQLException {
        return new OperationalException(rs.getLong("id"), rs.getString("source_type"), rs.getString("source_id"), rs.getString("status"),
            rs.getObject("claimed_by", Long.class), rs.getString("claimed_by_name"), instant(rs, "claimed_at"),
            rs.getObject("resolved_by", Long.class), rs.getString("resolved_by_name"), instant(rs, "resolved_at"),
            rs.getString("note"), rs.getInt("version"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
