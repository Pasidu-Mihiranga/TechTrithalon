package lk.techtrithalon.waypoint.receipt.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.receipt.application.ReceiptRepository;
import lk.techtrithalon.waypoint.receipt.domain.ReceiptViews;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcReceiptRepository implements ReceiptRepository {
    private final JdbcTemplate db;

    JdbcReceiptRepository(JdbcTemplate db) { this.db = db; }

    public List<ReceiptViews.Receipt> receiptsForOrders(Collection<Long> ids) {
        return ids.isEmpty() ? List.of() : db.query("SELECT * FROM receipt_confirmation WHERE order_id = ANY(?)", this::receipt, (Object) ids.toArray(Long[]::new));
    }

    public Optional<ReceiptViews.Receipt> receiptForOrder(long orderId) {
        return db.query("SELECT * FROM receipt_confirmation WHERE order_id=?", this::receipt, orderId).stream().findFirst();
    }

    public long insertReceipt(long orderId, long recordId, String outletId, String outcome, int delivered, String kind, Integer affected,
                              String note, long actor, String actorName, Instant at) {
        return db.queryForObject("""
            INSERT INTO receipt_confirmation(order_id,delivery_record_id,outlet_id,outcome,delivered_units,kind,affected_units,note,
                                             confirmed_by,confirmed_by_name,confirmed_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id
            """, Long.class, orderId, recordId, outletId, outcome, delivered, kind, affected, note, actor, actorName, Timestamp.from(at));
    }

    public long insertDiscrepancy(long receiptId, long orderId, String orderRef, String outletId, String depot, int delivered, String kind,
                                  int affected, String note, String vehicleId, String driverName, Instant deliveredAt, long actor,
                                  String actorName, Instant at) {
        return db.queryForObject("""
            INSERT INTO receipt_discrepancy(receipt_id,order_id,order_ref,outlet_id,depot,delivered_units,kind,affected_units,note,vehicle_id,
                                            driver_name,delivered_at,reported_by,reported_by_name,reported_at,status)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN') RETURNING id
            """, Long.class, receiptId, orderId, orderRef, outletId, depot, delivered, kind, affected, note, vehicleId, driverName,
            deliveredAt == null ? null : Timestamp.from(deliveredAt), actor, actorName, Timestamp.from(at));
    }

    public List<ReceiptViews.Discrepancy> discrepanciesForOrders(Collection<Long> ids) {
        return ids.isEmpty() ? List.of() : db.query("SELECT * FROM receipt_discrepancy WHERE order_id = ANY(?)", this::discrepancy, (Object) ids.toArray(Long[]::new));
    }

    public List<ReceiptViews.Discrepancy> discrepanciesForOutlet(String outletId, String status) {
        return db.query("SELECT * FROM receipt_discrepancy WHERE outlet_id=? AND (?::text IS NULL OR status=?) ORDER BY reported_at DESC,id DESC",
            this::discrepancy, outletId, status, status);
    }

    public List<ReceiptViews.Discrepancy> discrepanciesForDepot(String depot, String status) {
        return db.query("SELECT * FROM receipt_discrepancy WHERE (?::text IS NULL OR depot=?) AND (?::text IS NULL OR status=?) ORDER BY reported_at DESC,id DESC",
            this::discrepancy, depot, depot, status, status);
    }

    public Optional<ReceiptViews.Discrepancy> findDiscrepancy(long id, boolean forUpdate) {
        return db.query("SELECT * FROM receipt_discrepancy WHERE id=?" + (forUpdate ? " FOR UPDATE" : ""), this::discrepancy, id).stream().findFirst();
    }

    public boolean resolve(long id, int expectedVersion, String decision, String note, long actor, String actorName, Instant at) {
        return db.update("""
            UPDATE receipt_discrepancy SET status='RESOLVED',decision=?,decision_note=?,resolved_by=?,resolved_by_name=?,resolved_at=?,version=version+1
            WHERE id=? AND version=? AND status='OPEN'
            """, decision, note, actor, actorName, Timestamp.from(at), id, expectedVersion) == 1;
    }

    private ReceiptViews.Receipt receipt(ResultSet rs, int i) throws SQLException {
        return new ReceiptViews.Receipt(rs.getLong("id"), rs.getLong("order_id"), rs.getLong("delivery_record_id"), rs.getString("outlet_id"),
            rs.getString("outcome"), rs.getInt("delivered_units"), rs.getString("kind"), rs.getObject("affected_units", Integer.class),
            rs.getString("note"), rs.getString("confirmed_by_name"), rs.getTimestamp("confirmed_at").toInstant());
    }

    private ReceiptViews.Discrepancy discrepancy(ResultSet rs, int i) throws SQLException {
        return new ReceiptViews.Discrepancy(rs.getLong("id"), rs.getLong("receipt_id"), rs.getLong("order_id"), rs.getString("order_ref"),
            rs.getString("outlet_id"), rs.getString("depot"), rs.getInt("delivered_units"), rs.getString("kind"), rs.getInt("affected_units"),
            rs.getString("note"), rs.getString("vehicle_id"), rs.getString("driver_name"), instant(rs, "delivered_at"),
            rs.getString("reported_by_name"), rs.getTimestamp("reported_at").toInstant(), rs.getString("status"), rs.getString("decision"),
            rs.getString("decision_note"), rs.getString("resolved_by_name"), instant(rs, "resolved_at"), rs.getInt("version"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
