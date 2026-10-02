package lk.techtrithalon.waypoint.ordering.infrastructure;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import lk.techtrithalon.waypoint.ordering.application.OrderRepository;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcOrderRepository implements OrderRepository {
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
    public long countByDateDepotStatus(LocalDate date, String depot, String status) {
        Long count = db.queryForObject(
            "SELECT count(*) FROM customer_order WHERE order_date=? AND (?::text IS NULL OR depot=?) AND status=?",
            Long.class, Date.valueOf(date), depot, depot, status
        );
        return count == null ? 0 : count;
    }
}
