package lk.techtrithalon.waypoint.loading.infrastructure;

import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.loading.application.LoadTaskRepository;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadTaskStatus;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcLoadTaskRepository implements LoadTaskRepository {
    private static final RowMapper<LoadLine> LINE = (rs, i) -> new LoadLine(rs.getLong("id"), rs.getLong("order_id"),
        rs.getString("order_ref"), rs.getString("outlet_id"), rs.getString("temp_requirement"), rs.getInt("units"),
        rs.getBigDecimal("weight_kg"), rs.getBigDecimal("volume_m3"), rs.getInt("stop_seq"), rs.getInt("load_seq"),
        rs.getString("status"));

    private final JdbcTemplate db;
    JdbcLoadTaskRepository(JdbcTemplate db) { this.db = db; }

    public long insert(NewLoadTask t, List<Integer> loadSequence, Instant at) {
        long id = db.queryForObject("""
            INSERT INTO load_task(plan_id,plan_version,trip_id,plan_date,depot,vehicle_id,trip_index,brand,district,
                                  planned_depart,driver_user_id,status,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?) RETURNING id
            """, Long.class, t.planId(), t.planVersion(), t.tripId(), Date.valueOf(t.planDate()), t.depot(), t.vehicleId(),
            t.tripIndex(), t.brand(), t.district(), Time.valueOf(t.plannedDepart()), t.driverUserId(),
            Timestamp.from(at), Timestamp.from(at));
        for (int i = 0; i < t.lines().size(); i++) {
            var l = t.lines().get(i);
            db.update("""
                INSERT INTO load_line(load_task_id,order_id,order_ref,outlet_id,temp_requirement,units,weight_kg,volume_m3,
                                      stop_seq,load_seq,status)
                VALUES(?,?,?,?,?,?,?,?,?,?,'pending')
                """, id, l.orderId(), l.orderRef(), l.outletId(), l.tempRequirement(), l.units(), l.weightKg(), l.volumeM3(),
                l.stopSeq(), loadSequence.get(i));
        }
        return id;
    }

    public int supersedeForPlan(long planId, Instant at) {
        return db.update("UPDATE load_task SET status='superseded',version=version+1,updated_at=? WHERE plan_id=? AND status<>'superseded'",
            Timestamp.from(at), planId);
    }

    public List<LoadTaskStatus> statusForPlan(long planId) {
        return db.query("SELECT id,trip_id,plan_version,status FROM load_task WHERE plan_id=? ORDER BY id",
            (rs, i) -> new LoadTaskStatus(rs.getLong("id"), rs.getLong("trip_id"), rs.getInt("plan_version"), rs.getString("status")), planId);
    }

    public Optional<LoadTask> find(long id) {
        return db.query("SELECT * FROM load_task WHERE id=?", this::task, id).stream().findFirst();
    }

    public List<LoadTask> forPlan(long planId) {
        return db.query("SELECT * FROM load_task WHERE plan_id=? ORDER BY vehicle_id,trip_index", this::task, planId);
    }

    private LoadTask task(java.sql.ResultSet rs, int row) throws java.sql.SQLException {
        long id = rs.getLong("id");
        return new LoadTask(id, rs.getLong("plan_id"), rs.getInt("plan_version"), rs.getLong("trip_id"),
            rs.getDate("plan_date").toLocalDate(), rs.getString("depot"), rs.getString("vehicle_id"), rs.getInt("trip_index"),
            rs.getString("brand"), rs.getString("district"), rs.getTime("planned_depart").toLocalTime(),
            rs.getObject("driver_user_id", Long.class), rs.getString("status"), rs.getInt("version"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            db.query("SELECT * FROM load_line WHERE load_task_id=? ORDER BY load_seq", LINE, id));
    }
}
