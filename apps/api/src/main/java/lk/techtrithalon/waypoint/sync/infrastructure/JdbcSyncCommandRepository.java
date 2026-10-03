package lk.techtrithalon.waypoint.sync.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lk.techtrithalon.waypoint.sync.application.SyncCommandRepository;
import lk.techtrithalon.waypoint.sync.domain.SyncAction;
import lk.techtrithalon.waypoint.sync.domain.SyncResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcSyncCommandRepository implements SyncCommandRepository {
    private final JdbcTemplate db;
    private final ObjectMapper mapper;

    JdbcSyncCommandRepository(JdbcTemplate db, ObjectMapper mapper) { this.db = db; this.mapper = mapper; }

    public Optional<Stored> find(UUID id) {
        return db.query("SELECT * FROM sync_command WHERE client_action_id=?", (rs, i) -> {
            Map<String, Object> stored = rs.getString("result_detail") == null ? Map.of() : read(rs.getString("result_detail"));
            return new Stored(rs.getLong("user_id"), new SyncResult(id, rs.getString("result"), rs.getString("result_code"),
                stored.get("message") instanceof String m ? m : null, rs.getString("review_reason"), detail(stored),
                rs.getBoolean("clock_skew")));
        }, id).stream().findFirst();
    }

    public boolean claim(long userId, SyncAction a, String payloadJson, Instant receivedAt, boolean clockSkew) {
        return db.update("""
            INSERT INTO sync_command(client_action_id,user_id,action_type,plan_date,trip_index,entity_id,plan_version,payload,
                                     occurred_at,received_at,result,clock_skew)
            VALUES(?,?,?,?,?,?,?,?::jsonb,?,?,'REJECTED',?) ON CONFLICT (client_action_id) DO NOTHING
            """, a.clientActionId(), userId, a.actionType(), Date.valueOf(a.planDate()), a.tripIndex(),
            a.orderId() != null ? String.valueOf(a.orderId()) : a.outletId(), a.planVersion(), payloadJson,
            Timestamp.from(a.occurredAt()), Timestamp.from(receivedAt), clockSkew) == 1;
    }

    public void saveResult(UUID id, SyncResult r) {
        Map<String, Object> stored = new java.util.LinkedHashMap<>();
        if (r.message() != null) stored.put("message", r.message());
        if (r.detail() != null) stored.put("detail", r.detail());
        db.update("UPDATE sync_command SET result=?, result_code=?, result_detail=?::jsonb, review_reason=? WHERE client_action_id=?",
            r.result(), r.code(), stored.isEmpty() ? null : write(stored), r.review(), id);
    }

    public int purgeReceivedBefore(Instant cutoff) {
        return db.update("DELETE FROM sync_command WHERE received_at < ?", Timestamp.from(cutoff));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> detail(Map<String, Object> stored) {
        Object detail = stored.get("detail");
        return detail instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    private Map<String, Object> read(String json) {
        try { return mapper.readValue(json, new TypeReference<>() {}); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }

    private String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
