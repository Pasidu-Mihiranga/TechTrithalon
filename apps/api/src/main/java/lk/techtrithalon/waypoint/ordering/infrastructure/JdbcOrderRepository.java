package lk.techtrithalon.waypoint.ordering.infrastructure;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lk.techtrithalon.waypoint.ordering.application.OrderRepository;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import lk.techtrithalon.waypoint.ordering.domain.OrderStateMachine;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcOrderRepository implements OrderRepository {
    public boolean markPlanned(long id,int expectedVersion,java.time.Instant at) {
        return db.update("UPDATE customer_order SET status='planned',version=version+1,updated_at=? WHERE id=? AND status='confirmed' AND version=?",
            java.sql.Timestamp.from(at),id,expectedVersion)==1;
    }
    private static final Set<String> SORTS = Set.of(
        "ref", "outletId", "brand", "district", "tempRequirement", "units", "weightKg", "volumeM3", "status", "orderDate"
    );
    private static final Map<String, String> SORT_SQL = Map.ofEntries(
        Map.entry("ref", "ref"),
        Map.entry("outletId", "outlet_id"),
        Map.entry("brand", "brand"),
        Map.entry("district", "district"),
        Map.entry("tempRequirement", "temp_requirement"),
        Map.entry("units", "units"),
        Map.entry("weightKg", "weight_kg"),
        Map.entry("volumeM3", "volume_m3"),
        Map.entry("status", "status"),
        Map.entry("orderDate", "order_date")
    );

    private static final RowMapper<CustomerOrder> ROW = (rs, i) -> new CustomerOrder(
        rs.getLong("id"),
        rs.getString("ref"),
        rs.getString("outlet_id"),
        rs.getString("brand"),
        rs.getString("depot"),
        rs.getString("district"),
        rs.getDate("order_date").toLocalDate(),
        rs.getTimestamp("placed_at").toInstant(),
        rs.getTimestamp("confirmed_at") == null ? null : rs.getTimestamp("confirmed_at").toInstant(),
        rs.getString("temp_requirement"),
        rs.getInt("units"),
        rs.getBigDecimal("weight_kg"),
        rs.getBigDecimal("volume_m3"),
        rs.getString("status"),
        rs.getInt("iso_year"),
        rs.getInt("iso_week"),
        rs.getObject("placed_by") == null ? null : rs.getLong("placed_by"),
        rs.getInt("version")
    );

    private final JdbcTemplate db;

    JdbcOrderRepository(JdbcTemplate db) { this.db = db; }

    @Override
    public OrderPage search(
        LocalDate date, String depot, String outletId, String brand, String tempRequirement,
        String status, String query, String sort, boolean ascending, int page, int size
    ) {
        String sortKey = SORTS.contains(sort) ? sort : "ref";
        String direction = ascending ? "ASC" : "DESC";
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (date != null) { where.append(" AND order_date=?"); args.add(Date.valueOf(date)); }
        if (depot != null) { where.append(" AND depot=?"); args.add(depot); }
        if (outletId != null) { where.append(" AND outlet_id=?"); args.add(outletId); }
        if (brand != null && !brand.isBlank()) { where.append(" AND brand=?"); args.add(brand); }
        if (tempRequirement != null && !tempRequirement.isBlank()) {
            where.append(" AND temp_requirement=?"); args.add(tempRequirement);
        }
        if (status != null && !status.isBlank()) { where.append(" AND status=?"); args.add(status); }
        if (query != null && !query.isBlank()) {
            where.append(" AND (ref ILIKE ? OR outlet_id ILIKE ? OR district ILIKE ?)");
            String like = "%" + query.trim() + "%";
            args.add(like); args.add(like); args.add(like);
        }
        Long total = db.queryForObject("SELECT count(*) FROM customer_order" + where, Long.class, args.toArray());
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 200);
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(safeSize);
        pageArgs.add(safePage * safeSize);
        List<CustomerOrder> items = db.query(
            "SELECT * FROM customer_order" + where
                + " ORDER BY " + SORT_SQL.get(sortKey) + " " + direction + ", id ASC LIMIT ? OFFSET ?",
            ROW, pageArgs.toArray()
        );
        return new OrderPage(items, total == null ? 0 : total, safePage, safeSize);
    }

    @Override
    public Optional<CustomerOrder> findById(long id) {
        return db.query("SELECT * FROM customer_order WHERE id=?", ROW, id).stream().findFirst();
    }

    @Override
    public Optional<CustomerOrder> findByRef(String ref) {
        return db.query("SELECT * FROM customer_order WHERE ref=?", ROW, ref).stream().findFirst();
    }

    @Override
    public List<CustomerOrder> findByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        String placeholders = String.join(",", Collections.nCopies(ids.size(), "?"));
        return db.query(
            "SELECT * FROM customer_order WHERE id IN (" + placeholders + ") ORDER BY id ASC",
            ROW, ids.toArray()
        );
    }

    @Override
    public List<CustomerOrder> findConfirmedForDateDepot(LocalDate date, String depot) {
        return db.query("""
            SELECT * FROM customer_order
            WHERE order_date=? AND depot=? AND status='confirmed'
            ORDER BY id ASC
            """, ROW, Date.valueOf(date), depot);
    }

    @Override
    public long countByDateDepotStatus(LocalDate date, String depot, String status) {
        Long count = db.queryForObject(
            "SELECT count(*) FROM customer_order WHERE order_date=? AND (?::text IS NULL OR depot=?) AND status=?",
            Long.class, Date.valueOf(date), depot, depot, status
        );
        return count == null ? 0 : count;
    }

    @Override
    public boolean existsActive(String outletId, LocalDate orderDate, String tempRequirement) {
        Integer count = db.queryForObject("""
            SELECT count(*) FROM customer_order
            WHERE outlet_id=? AND order_date=? AND temp_requirement=? AND status <> 'cancelled'
            """, Integer.class, outletId, Date.valueOf(orderDate), tempRequirement);
        return count != null && count > 0;
    }

    @Override
    public CustomerOrder insertConfirmed(
        String outletId, String brand, String depot, String district, LocalDate orderDate,
        Instant placedAt, String tempRequirement, int units, BigDecimal weightKg, BigDecimal volumeM3,
        int isoYear, int isoWeek, long placedBy
    ) {
        String status = OrderStateMachine.newConfirmed().value();
        String tempRef = "TMP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        List<Long> insertedIds = db.query("""
            INSERT INTO customer_order (
              ref, outlet_id, brand, depot, district, order_date, placed_at, confirmed_at,
              temp_requirement, units, weight_kg, volume_m3, status, iso_year, iso_week,
              placed_by, version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT (outlet_id, order_date, temp_requirement) WHERE status <> 'cancelled'
            DO NOTHING RETURNING id
            """, (rs, i) -> rs.getLong("id"),
            tempRef, outletId, brand, depot, district, Date.valueOf(orderDate),
            Timestamp.from(placedAt), Timestamp.from(placedAt), tempRequirement, units, weightKg, volumeM3,
            status, isoYear, isoWeek, placedBy, Timestamp.from(placedAt));
        if (insertedIds.isEmpty()) throw new ApiException(
            HttpStatus.CONFLICT, "DUPLICATE_TEMP_ORDER",
            "An active order already exists for this outlet, date and temperature");
        Long id = insertedIds.getFirst();
        String ref = "ORD-" + String.format("%06d", id);
        db.update("UPDATE customer_order SET ref=? WHERE id=?", ref, id);
        return findById(id).orElseThrow();
    }
}
