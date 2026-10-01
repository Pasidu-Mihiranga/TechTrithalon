package lk.techtrithalon.waypoint.audit.application;
import java.time.Clock;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.audit.infrastructure.JdbcAuditWriter;
import org.springframework.stereotype.Service;
/** Published append-only service; callers include it in their state-change transaction. */
@Service
public class AuditService {
    private final JdbcAuditWriter writer;
    private final Clock clock;
    public AuditService(JdbcAuditWriter writer,Clock clock) { this.writer=writer; this.clock=clock; }
    public void record(String type,CurrentUser actor,String entityType,String entityId,Object before,Object after,String reason) {
        writer.append(type,actor.id(),entityType,entityId,before,after,reason,clock.instant());
    }
}
