package lk.techtrithalon.waypoint.loading.infrastructure;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.loading.application.LoadTaskRepository;
import lk.techtrithalon.waypoint.loading.domain.LoadLine;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcLoadTaskRepository implements LoadTaskRepository {
    private static final RowMapper<LoadLine> LINE = (rs, i) -> new LoadLine(rs.getLong("id"), rs.getLong("order_id"),
        rs.getString("order_ref"), rs.getString("outlet_id"), rs.getString("temp_requirement"), rs.getInt("units"),
        rs.getBigDecimal("weight_kg"), rs.getBigDecimal("volume_m3"), rs.getInt("stop_seq"), rs.getInt("load_seq"),
        rs.getString("status"), rs.getObject("loaded_units", Integer.class), instant(rs.getTimestamp("checked_at")),
        rs.getObject("carried_from_line_id") != null);
    private static final RowMapper<LoadingIssue> ISSUE = (rs, i) -> new LoadingIssue(rs.getLong("id"), rs.getLong("load_task_id"),
        rs.getLong("load_line_id"), rs.getLong("order_id"), rs.getString("order_ref"), rs.getString("outlet_id"),
        rs.getDate("plan_date").toLocalDate(), rs.getString("depot"), rs.getString("vehicle_id"), rs.getInt("trip_index"),
        rs.getString("kind"), rs.getInt("ordered_units"), rs.getInt("short_units"), rs.getString("note"), rs.getBoolean("holds_vehicle"),
        rs.getString("status"), rs.getString("reported_by_name"), rs.getTimestamp("reported_at").toInstant(), rs.getString("decision"),
        rs.getString("decision_note"), rs.getString("resolved_by_name"), instant(rs.getTimestamp("resolved_at")), rs.getInt("version"));

    private final JdbcTemplate db;
    JdbcLoadTaskRepository(JdbcTemplate db) { this.db = db; }

    public long insert(NewLoadTask t, List<Integer> loadSequence, Long replacesTaskId, boolean ackRequired, Instant at) {
        long id = db.queryForObject("""
            INSERT INTO load_task(plan_id,plan_version,trip_id,plan_date,depot,vehicle_id,trip_index,brand,district,
                                  planned_depart,driver_user_id,driver_name,weight_cap_kg,volume_cap_m3,status,
                                  replaces_task_id,acknowledgement_required,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?) RETURNING id
            """, Long.class, t.planId(), t.planVersion(), t.tripId(), Date.valueOf(t.planDate()), t.depot(), t.vehicleId(),
            t.tripIndex(), t.brand(), t.district(), Time.valueOf(t.plannedDepart()), t.driverUserId(), t.driverName(),
            t.weightCapKg(), t.volumeCapM3(), replacesTaskId, ackRequired, Timestamp.from(at), Timestamp.from(at));
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

    public Optional<LoadTask> find(long id, boolean forUpdate) {
        return db.query("SELECT * FROM load_task WHERE id=?" + (forUpdate ? " FOR UPDATE" : ""), this::task, id).stream().findFirst();
    }

    public List<LoadTask> forPlan(long planId) {
        return db.query("SELECT * FROM load_task WHERE plan_id=? ORDER BY vehicle_id,trip_index", this::task, planId);
    }

    public List<LoadTask> activeForRun(LocalDate date, String depot) {
        return db.query("SELECT * FROM load_task WHERE plan_date=? AND depot=? AND status<>'superseded' ORDER BY planned_depart,vehicle_id,trip_index",
            this::task, Date.valueOf(date), depot);
    }

    public List<LoadTask> activeForDriver(LocalDate date, long driverUserId) {
        return db.query("SELECT * FROM load_task WHERE plan_date=? AND driver_user_id=? AND status<>'superseded' ORDER BY planned_depart,trip_index",
            this::task, Date.valueOf(date), driverUserId);
    }

    public List<LoadTask> allForDriver(LocalDate date, long driverUserId) {
        return db.query("SELECT * FROM load_task WHERE plan_date=? AND driver_user_id=? ORDER BY plan_version DESC,trip_index",
            this::task, Date.valueOf(date), driverUserId);
    }

    public void inheritLoaded(long taskId, long replacedTaskId) {
        db.update("""
            UPDATE load_task n SET status='loaded', loaded_by=o.loaded_by, loaded_at=o.loaded_at,
                   started_by=o.started_by, started_at=o.started_at
            FROM load_task o WHERE n.id=? AND o.id=? AND o.loaded_at IS NOT NULL
            """, taskId, replacedTaskId);
    }

    public Optional<LoadTask> forSlot(long planId, String vehicleId, int tripIndex) {
        return db.query("SELECT * FROM load_task WHERE plan_id=? AND vehicle_id=? AND trip_index=?", this::task, planId, vehicleId, tripIndex)
            .stream().findFirst();
    }

    public Optional<Long> replacedBy(long taskId) {
        return db.query("SELECT id FROM load_task WHERE replaces_task_id=?", (rs, i) -> rs.getLong(1), taskId).stream().findFirst();
    }

    public void carryLine(long newLineId, long newTaskId, long oldLineId, int planVersion) {
        db.update("""
            UPDATE load_line n SET status=o.status, loaded_units=o.loaded_units, checked_by=o.checked_by, checked_at=o.checked_at,
                                   carried_from_line_id=o.id
            FROM load_line o WHERE n.id=? AND o.id=?
            """, newLineId, oldLineId);
        db.update("UPDATE loading_issue SET load_task_id=?, load_line_id=?, version=version+1 WHERE load_line_id=? AND status='OPEN'",
            newTaskId, newLineId, oldLineId);
    }

    public void markStarted(long taskId, long actor, Instant at) {
        db.update("UPDATE load_task SET status='loading', started_by=COALESCE(started_by,?), started_at=COALESCE(started_at,?) WHERE id=? AND status='pending'",
            actor, Timestamp.from(at), taskId);
    }

    public void inheritStart(long taskId, long replacedTaskId) {
        db.update("""
            UPDATE load_task n SET status='loading', started_by=o.started_by, started_at=o.started_at
            FROM load_task o WHERE n.id=? AND o.id=? AND o.started_at IS NOT NULL
            """, taskId, replacedTaskId);
    }

    public void recordLine(long lineId, String status, int loadedUnits, long actor, Instant at) {
        db.update("UPDATE load_line SET status=?, loaded_units=?, checked_by=?, checked_at=? WHERE id=?",
            status, loadedUnits, actor, Timestamp.from(at), lineId);
    }

    public void acknowledge(long taskId, long actor, Instant at) {
        db.update("UPDATE load_task SET acknowledged_by=?, acknowledged_at=? WHERE id=? AND acknowledged_at IS NULL", actor, Timestamp.from(at), taskId);
    }

    public void markLoaded(long taskId, long actor, Instant at) {
        db.update("UPDATE load_task SET status='loaded', loaded_by=?, loaded_at=? WHERE id=?", actor, Timestamp.from(at), taskId);
    }

    public boolean bumpVersion(long taskId, int expected, Instant at) {
        return db.update("UPDATE load_task SET version=version+1, updated_at=? WHERE id=? AND version=?", Timestamp.from(at), taskId, expected) == 1;
    }

    public long insertIssue(LoadTask t, long lineId, long orderId, String orderRef, String outletId, String kind, int orderedUnits,
                            int shortUnits, String note, boolean holds, long actor, String actorName, Instant at) {
        return db.queryForObject("""
            INSERT INTO loading_issue(load_task_id,load_line_id,order_id,order_ref,outlet_id,plan_date,depot,vehicle_id,trip_index,
                                      kind,ordered_units,short_units,note,holds_vehicle,status,reported_by,reported_by_name,reported_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,?,?) RETURNING id
            """, Long.class, t.id(), lineId, orderId, orderRef, outletId, Date.valueOf(t.planDate()), t.depot(), t.vehicleId(),
            t.tripIndex(), kind, orderedUnits, shortUnits, note, holds, actor, actorName, Timestamp.from(at));
    }

    public Optional<LoadingIssue> findIssue(long id, boolean forUpdate) {
        return db.query("SELECT * FROM loading_issue WHERE id=?" + (forUpdate ? " FOR UPDATE" : ""), ISSUE, id).stream().findFirst();
    }

    public List<LoadingIssue> issuesForTask(long taskId) {
        return db.query("SELECT * FROM loading_issue WHERE load_task_id=? ORDER BY reported_at DESC, id DESC", ISSUE, taskId);
    }

    public List<LoadingIssue> issuesForRun(LocalDate date, String depot, String status) {
        return db.query("""
            SELECT * FROM loading_issue WHERE plan_date=? AND depot=? AND (?::text IS NULL OR status=?)
            ORDER BY (status='OPEN') DESC, reported_at DESC, id DESC
            """, ISSUE, Date.valueOf(date), depot, status, status);
    }

    public boolean resolveIssue(long id, int expected, String decision, String note, long actor, String actorName, Instant at) {
        return db.update("""
            UPDATE loading_issue SET status='RESOLVED', decision=?, decision_note=?, resolved_by=?, resolved_by_name=?, resolved_at=?,
                                     version=version+1
            WHERE id=? AND status='OPEN' AND version=?
            """, decision, note, actor, actorName, Timestamp.from(at), id, expected) == 1;
    }

    private LoadTask task(ResultSet rs, int row) throws SQLException {
        long id = rs.getLong("id");
        return new LoadTask(id, rs.getLong("plan_id"), rs.getInt("plan_version"), rs.getLong("trip_id"),
            rs.getDate("plan_date").toLocalDate(), rs.getString("depot"), rs.getString("vehicle_id"), rs.getInt("trip_index"),
            rs.getString("brand"), rs.getString("district"), rs.getTime("planned_depart").toLocalTime(),
            rs.getObject("driver_user_id", Long.class), rs.getString("driver_name"), rs.getBigDecimal("weight_cap_kg"),
            rs.getBigDecimal("volume_cap_m3"), rs.getString("status"), rs.getObject("replaces_task_id", Long.class),
            rs.getBoolean("acknowledgement_required"), instant(rs.getTimestamp("acknowledged_at")), instant(rs.getTimestamp("started_at")),
            instant(rs.getTimestamp("loaded_at")), rs.getInt("version"),
            rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(),
            db.query("SELECT * FROM load_line WHERE load_task_id=? ORDER BY load_seq", LINE, id));
    }

    private static Instant instant(Timestamp value) { return value == null ? null : value.toInstant(); }
}
