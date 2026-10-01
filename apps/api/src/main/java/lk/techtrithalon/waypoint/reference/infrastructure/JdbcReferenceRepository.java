package lk.techtrithalon.waypoint.reference.infrastructure;
import java.sql.Date;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.reference.application.ReferenceRepository;
import lk.techtrithalon.waypoint.reference.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
class JdbcReferenceRepository implements ReferenceRepository {
    private final JdbcTemplate db;
    JdbcReferenceRepository(JdbcTemplate db) { this.db = db; }
    private static LocalTime time(Time value) { return value == null ? null : value.toLocalTime(); }
    public List<Outlet> outlets(String id, String depot, String brand, String district) {
        return db.query("""
            SELECT *, greatest(window_open, coalesce(mall_window_open, window_open)) effective_open,
                least(window_close, coalesce(mall_window_close, window_close)) effective_close FROM outlet
            WHERE (?::text IS NULL OR outlet_id=?) AND (?::text IS NULL OR depot=?)
                AND (?::text IS NULL OR brand=?) AND (?::text IS NULL OR district=?) ORDER BY outlet_id
            """, (rs, i) -> new Outlet(rs.getString("outlet_id"), rs.getString("brand"), rs.getString("district"),
                rs.getString("depot"), rs.getString("dock_type"), rs.getString("parking_constraint"),
                time(rs.getTime("window_open")), time(rs.getTime("window_close")), time(rs.getTime("mall_window_open")),
                time(rs.getTime("mall_window_close")), time(rs.getTime("effective_open")), time(rs.getTime("effective_close"))),
                id, id, depot, depot, brand, brand, district, district);
    }
    public List<Vehicle> vehicles(String depot) {
        return db.query("SELECT * FROM vehicle WHERE (?::text IS NULL OR depot=?) ORDER BY vehicle_id",
            (rs,i) -> new Vehicle(rs.getString("vehicle_id"), rs.getString("type"), rs.getString("temp"),
                rs.getBigDecimal("weight_cap_kg"), rs.getBigDecimal("volume_cap_m3"), rs.getString("fuel_type"),
                rs.getBigDecimal("km_per_l"), rs.getBigDecimal("weekly_fuel_quota_l"), rs.getString("depot")), depot, depot);
    }
    public Optional<Vehicle> vehicle(String id) { return vehicles(null).stream().filter(v -> v.vehicleId().equals(id)).findFirst(); }
    public List<DistrictTravel> districts(String depot, String outletId) {
        return db.query("""
            SELECT d.* FROM district_travel d WHERE (?::text IS NULL OR d.depot=?)
                AND (?::text IS NULL OR EXISTS(SELECT 1 FROM outlet o WHERE o.outlet_id=? AND o.district=d.district))
            ORDER BY d.district
            """, (rs,i) -> new DistrictTravel(rs.getString("district"), rs.getString("depot"), rs.getString("road_class"),
                rs.getBigDecimal("free_flow_kmh"), rs.getBigDecimal("depot_to_district_km"), rs.getInt("depot_to_district_min"),
                rs.getBigDecimal("inter_stop_km"), rs.getInt("inter_stop_min")), depot, depot, outletId, outletId);
    }
    public List<ServiceAllowance> allowances(String brand) {
        return db.query("SELECT * FROM service_allowance WHERE (?::text IS NULL OR brand=?) ORDER BY brand,dock_type",
            (rs,i) -> new ServiceAllowance(rs.getString("brand"),rs.getString("dock_type"),rs.getInt("minutes")),brand,brand);
    }
    public List<CalendarDay> calendar(LocalDate from, LocalDate to) {
        return db.query("SELECT * FROM calendar_day WHERE date BETWEEN ? AND ? ORDER BY date",
            (rs,i) -> new CalendarDay(rs.getDate("date").toLocalDate(),rs.getInt("iso_year"),rs.getInt("iso_week"),
                rs.getBoolean("is_operating"),rs.getBoolean("is_payday"),rs.getString("festival"),
                rs.getBigDecimal("festival_ramp"),rs.getBoolean("monsoon")),Date.valueOf(from),Date.valueOf(to));
    }
}
