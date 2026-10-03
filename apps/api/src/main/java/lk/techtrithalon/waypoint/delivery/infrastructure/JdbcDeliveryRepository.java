package lk.techtrithalon.waypoint.delivery.infrastructure;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.delivery.application.DeliveryRepository;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryRecord;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryTrip;
import lk.techtrithalon.waypoint.delivery.domain.PodAsset;
import lk.techtrithalon.waypoint.delivery.domain.StopVisit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcDeliveryRepository implements DeliveryRepository {
    private final JdbcTemplate db;

    JdbcDeliveryRepository(JdbcTemplate db) { this.db = db; }

    public long insertTrip(LocalDate date, String depot, String vehicleId, int tripIndex, long driver, int planVersion, Instant at) {
        return db.queryForObject("""
            INSERT INTO delivery_trip(plan_date,depot,vehicle_id,trip_index,driver_user_id,started_plan_version,status,started_at,created_at,updated_at)
            VALUES(?,?,?,?,?,?,'in_progress',?,?,?) RETURNING id
            """, Long.class, Date.valueOf(date), depot, vehicleId, tripIndex, driver, planVersion,
            Timestamp.from(at), Timestamp.from(at), Timestamp.from(at));
    }

    public Optional<DeliveryTrip> trip(LocalDate date, String vehicleId, int tripIndex, boolean forUpdate) {
        return db.query("SELECT * FROM delivery_trip WHERE plan_date=? AND vehicle_id=? AND trip_index=?" + (forUpdate ? " FOR UPDATE" : ""),
            this::mapTrip, Date.valueOf(date), vehicleId, tripIndex).stream().findFirst();
    }

    public Optional<DeliveryTrip> trip(long id) {
        return db.query("SELECT * FROM delivery_trip WHERE id=?", this::mapTrip, id).stream().findFirst();
    }

    public List<DeliveryTrip> tripsForRun(LocalDate date, String depot) {
        return db.query("SELECT * FROM delivery_trip WHERE plan_date=? AND depot=? ORDER BY vehicle_id,trip_index", this::mapTrip, Date.valueOf(date), depot);
    }

    public List<DeliveryTrip> pastTrips(long driver, LocalDate before, int limit) {
        return db.query("SELECT * FROM delivery_trip WHERE driver_user_id=? AND plan_date<? ORDER BY plan_date DESC,trip_index DESC LIMIT ?",
            this::mapTrip, driver, Date.valueOf(before), limit);
    }

    public boolean bumpVersion(long tripId, int expected, Instant at) {
        return db.update("UPDATE delivery_trip SET version=version+1, updated_at=? WHERE id=? AND version=?", Timestamp.from(at), tripId, expected) == 1;
    }

    public void touch(long tripId, Instant at) {
        db.update("UPDATE delivery_trip SET version=version+1, updated_at=? WHERE id=?", Timestamp.from(at), tripId);
    }

    public void complete(long tripId, Instant at) {
        db.update("UPDATE delivery_trip SET status='completed', completed_at=? WHERE id=?", Timestamp.from(at), tripId);
    }

    public List<StopVisit> visits(long tripId) {
        return db.query("SELECT * FROM stop_visit WHERE delivery_trip_id=? ORDER BY arrived_at,id", (rs, i) ->
            new StopVisit(rs.getLong("id"), rs.getLong("delivery_trip_id"), rs.getString("outlet_id"),
                instant(rs, "arrived_at"), instant(rs, "departed_at")), tripId);
    }

    public void arrive(long tripId, String outletId, long actor, Instant at) {
        db.update("INSERT INTO stop_visit(delivery_trip_id,outlet_id,arrived_at,arrived_by) VALUES(?,?,?,?)", tripId, outletId, Timestamp.from(at), actor);
    }

    public void depart(long visitId, long actor, Instant at) {
        db.update("UPDATE stop_visit SET departed_at=?, departed_by=? WHERE id=? AND departed_at IS NULL", Timestamp.from(at), actor, visitId);
    }

    public List<DeliveryRecord> records(long tripId) {
        return db.query("SELECT * FROM delivery_record WHERE delivery_trip_id=? ORDER BY id", this::mapRecord, tripId);
    }

    public Optional<DeliveryRecord> recordForOrder(long orderId) {
        return db.query("SELECT * FROM delivery_record WHERE order_id=?", this::mapRecord, orderId).stream().findFirst();
    }

    public List<DeliveryRecord> recordsForOrders(Collection<Long> orderIds) {
        return db.query("SELECT * FROM delivery_record WHERE order_id = ANY(?)", this::mapRecord, (Object) orderIds.toArray(Long[]::new));
    }

    public List<PodAsset> assetsForOrders(Collection<Long> orderIds) {
        return db.query("SELECT * FROM pod_asset WHERE order_id = ANY(?)", this::mapAsset, (Object) orderIds.toArray(Long[]::new));
    }

    public long insertRecord(long tripId, long orderId, String outletId, String outcome, int ordered, int loaded, int delivered,
                             String issueKind, String recipient, String notes, long actor, Instant occurredAt, Instant recordedAt,
                             String review) {
        return db.queryForObject("""
            INSERT INTO delivery_record(delivery_trip_id,order_id,outlet_id,outcome,ordered_units,loaded_units,delivered_units,
                                        issue_kind,recipient_name,notes,recorded_by,occurred_at,recorded_at,review_reason)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
            """, Long.class, tripId, orderId, outletId, outcome, ordered, loaded, delivered, issueKind, recipient, notes, actor,
            Timestamp.from(occurredAt), Timestamp.from(recordedAt), review);
    }

    public long insertAsset(long tripId, long orderId, String kind, String storage, String objectKey, String contentType,
                            int bytes, int width, int height, long actor, Instant at, java.util.UUID clientUploadId) {
        return db.queryForObject("""
            INSERT INTO pod_asset(delivery_trip_id,order_id,kind,storage,object_key,content_type,bytes,width,height,uploaded_by,uploaded_at,client_upload_id)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
            """, Long.class, tripId, orderId, kind, storage, objectKey, contentType, bytes, width, height, actor, Timestamp.from(at), clientUploadId);
    }

    public Optional<PodAsset> assetByClientId(long uploader, java.util.UUID clientUploadId) {
        return db.query("SELECT * FROM pod_asset WHERE client_upload_id=? AND uploaded_by=?", this::mapAsset, clientUploadId, uploader).stream().findFirst();
    }

    public Optional<PodAsset> asset(long id) {
        return db.query("SELECT * FROM pod_asset WHERE id=?", this::mapAsset, id).stream().findFirst();
    }

    public List<PodAsset> assetsForOrder(long orderId) {
        return db.query("SELECT * FROM pod_asset WHERE order_id=? ORDER BY id", this::mapAsset, orderId);
    }

    public List<PodAsset> assetsForTrip(long tripId) {
        return db.query("SELECT * FROM pod_asset WHERE delivery_trip_id=? ORDER BY id", this::mapAsset, tripId);
    }

    public int attachAssets(Collection<Long> assetIds, long orderId, long recordId) {
        int attached = 0;
        for (long id : assetIds)
            attached += db.update("UPDATE pod_asset SET delivery_record_id=? WHERE id=? AND order_id=? AND delivery_record_id IS NULL", recordId, id, orderId);
        return attached;
    }

    private DeliveryTrip mapTrip(ResultSet rs, int i) throws SQLException {
        return new DeliveryTrip(rs.getLong("id"), rs.getDate("plan_date").toLocalDate(), rs.getString("depot"), rs.getString("vehicle_id"),
            rs.getInt("trip_index"), rs.getLong("driver_user_id"), rs.getInt("started_plan_version"), rs.getString("status"),
            instant(rs, "started_at"), instant(rs, "completed_at"), rs.getInt("version"));
    }

    private DeliveryRecord mapRecord(ResultSet rs, int i) throws SQLException {
        return new DeliveryRecord(rs.getLong("id"), rs.getLong("delivery_trip_id"), rs.getLong("order_id"), rs.getString("outlet_id"),
            rs.getString("outcome"), rs.getInt("ordered_units"), rs.getInt("loaded_units"), rs.getInt("delivered_units"),
            rs.getString("issue_kind"), rs.getString("recipient_name"), rs.getString("notes"), rs.getLong("recorded_by"),
            instant(rs, "occurred_at"), instant(rs, "recorded_at"), rs.getString("review_reason"));
    }

    private PodAsset mapAsset(ResultSet rs, int i) throws SQLException {
        return new PodAsset(rs.getLong("id"), rs.getLong("delivery_trip_id"), rs.getLong("order_id"), rs.getObject("delivery_record_id", Long.class),
            rs.getString("kind"), rs.getString("storage"), rs.getString("object_key"), rs.getString("content_type"), rs.getInt("bytes"),
            rs.getInt("width"), rs.getInt("height"), rs.getLong("uploaded_by"), instant(rs, "uploaded_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
