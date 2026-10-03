package lk.techtrithalon.waypoint.planning.infrastructure;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.application.ManualPlanRepository;
import lk.techtrithalon.waypoint.planning.domain.ManualPlan;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcManualPlanRepository implements ManualPlanRepository {
    private final JdbcTemplate db;
    JdbcManualPlanRepository(JdbcTemplate db) { this.db = db; }
    public void lockScope(LocalDate date, String depot) {
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", Object.class,
            "plan:" + date + ":" + depot);
    }
    public ManualPlan create(long snapshot, LocalDate date, String depot, long actor, Instant at) {
        int version = db.queryForObject("SELECT COALESCE(max(version),0)+1 FROM plan WHERE plan_date=? AND depot=?",
            Integer.class, Date.valueOf(date), depot);
        long id = db.queryForObject("""
            INSERT INTO plan(snapshot_id,plan_date,depot,version,status,created_by,created_at,updated_at)
            VALUES(?,?,?,?,'candidate',?,?,?) RETURNING id
            """, Long.class, snapshot, Date.valueOf(date), depot, version, actor, Timestamp.from(at), Timestamp.from(at));
        return find(id, false).orElseThrow();
    }
    public Optional<ManualPlan> find(long id, boolean lock) {
        return db.query("SELECT * FROM plan WHERE id=?" + (lock ? " FOR UPDATE" : ""), (rs,i) -> {
            List<ManualPlan.TripAssignment> trips = db.query("SELECT * FROM trip WHERE plan_id=? ORDER BY vehicle_id,trip_index",
                (t,j) -> new ManualPlan.TripAssignment(t.getLong("id"),t.getString("vehicle_id"),t.getInt("trip_index"),
                    t.getString("brand"),t.getString("district"),db.query("SELECT order_id FROM stop WHERE trip_id=? ORDER BY seq",
                        (s,k) -> s.getLong(1),t.getLong("id"))), id);
            List<ManualPlan.OrderDisposition> reasons = db.query("SELECT * FROM plan_order_disposition WHERE plan_id=? ORDER BY order_id",
                (d,j) -> new ManualPlan.OrderDisposition(d.getLong("order_id"),d.getString("code"),d.getString("reason"),
                    d.getDate("next_delivery_date") == null ? null : d.getDate("next_delivery_date").toLocalDate(),
                    d.getString("reason_code"),d.getBoolean("protect_next_run"),d.getBoolean("notify_store"),
                    d.getObject("decided_by",Long.class),d.getString("decided_by_name"),d.getTimestamp("decided_at") == null ? null : d.getTimestamp("decided_at").toInstant()), id);
            return new ManualPlan(id,rs.getLong("snapshot_id"),rs.getDate("plan_date").toLocalDate(),rs.getString("depot"),
                rs.getInt("version"),rs.getString("status"),rs.getInt("lock_version"),rs.getLong("created_by"),
                rs.getTimestamp("created_at").toInstant(),rs.getTimestamp("updated_at").toInstant(),
                rs.getObject("published_by",Long.class),rs.getTimestamp("published_at") == null ? null : rs.getTimestamp("published_at").toInstant(),trips,reasons);
        }, id).stream().findFirst();
    }
    public List<Long> list(LocalDate date, String depot) {
        return db.query("SELECT id FROM plan WHERE plan_date=? AND (?::text IS NULL OR depot=?) ORDER BY version DESC,id DESC",
            (rs,i) -> rs.getLong(1), Date.valueOf(date), depot, depot);
    }
    public void replace(ManualPlan plan, List<ManualPlan.TripAssignment> trips,
                        List<ManualPlan.OrderDisposition> dispositions, Instant at) {
        db.update("DELETE FROM stop WHERE plan_id=?",plan.id());
        db.execute("SET CONSTRAINTS ux_manual_trip_slot DEFERRED");
        List<Long> keep = trips.stream().filter(t -> t.id()>0).map(ManualPlan.TripAssignment::id).toList();
        for (var before : plan.trips()) if (!keep.contains(before.id())) db.update("DELETE FROM trip WHERE id=?",before.id());
        for (var trip : trips) {
            Long id = trip.id()>0 && db.queryForObject("SELECT count(*) FROM trip WHERE id=? AND plan_id=?",Integer.class,trip.id(),plan.id())>0
                ? trip.id() : db.queryForObject("INSERT INTO trip(plan_id,vehicle_id,trip_index,brand,district) VALUES(?,?,?,?,?) RETURNING id",
                    Long.class,plan.id(),trip.vehicleId(),trip.tripIndex(),trip.brand(),trip.district());
            db.update("UPDATE trip SET vehicle_id=?,trip_index=?,brand=?,district=? WHERE id=?",trip.vehicleId(),trip.tripIndex(),trip.brand(),trip.district(),id);
            for (int seq=0;seq<trip.orderIds().size();seq++) db.update("INSERT INTO stop(plan_id,trip_id,order_id,seq) VALUES(?,?,?,?)",
                plan.id(),id,trip.orderIds().get(seq),seq+1);
        }
        db.update("DELETE FROM plan_order_disposition WHERE plan_id=?",plan.id());
        for (var d : dispositions) db.update("""
            INSERT INTO plan_order_disposition(plan_id,order_id,code,reason,next_delivery_date,reason_code,protect_next_run,notify_store,decided_by,decided_by_name,decided_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
            """,plan.id(),d.orderId(),d.code(),d.reason(),d.nextDeliveryDate()==null ? null : Date.valueOf(d.nextDeliveryDate()),
            d.reasonCode(),d.protectNextRun(),d.notifyStore(),d.decidedBy(),d.decidedByName(),d.decidedAt()==null ? null : Timestamp.from(d.decidedAt()));
        db.update("UPDATE plan SET lock_version=lock_version+1,updated_at=? WHERE id=?",Timestamp.from(at),plan.id());
    }
    public boolean hasPublished(LocalDate date, String depot) {
        return db.queryForObject("SELECT count(*) FROM plan WHERE plan_date=? AND depot=? AND status='published'",
            Integer.class,Date.valueOf(date),depot)>0;
    }
    public void publish(ManualPlan plan, long actor, Instant at) {
        db.update("UPDATE plan SET status='published',lock_version=lock_version+1,published_by=?,published_at=?,updated_at=? WHERE id=?",
            actor,Timestamp.from(at),Timestamp.from(at),plan.id());
    }
}
