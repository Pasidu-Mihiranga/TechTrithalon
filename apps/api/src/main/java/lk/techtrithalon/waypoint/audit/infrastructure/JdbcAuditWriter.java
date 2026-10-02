package lk.techtrithalon.waypoint.audit.infrastructure;
import java.time.Instant;
import java.sql.Timestamp;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class JdbcAuditWriter {
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    public JdbcAuditWriter(JdbcTemplate db,ObjectMapper mapper) { this.db=db; this.mapper=mapper; }
    public void append(String type,long actor,String entityType,String entityId,Object before,Object after,String reason,Instant at) {
        try {
            db.update("INSERT INTO audit_event(type,actor_id,entity_type,entity_id,before_json,after_json,reason,occurred_at,recorded_at) VALUES (?,?,?,?,?::jsonb,?::jsonb,?,?,?)",
                type,actor,entityType,entityId,mapper.writeValueAsString(before),mapper.writeValueAsString(after),reason,Timestamp.from(at),Timestamp.from(at));
        } catch (JsonProcessingException e) { throw new IllegalStateException("Could not encode audit event",e); }
    }
}
