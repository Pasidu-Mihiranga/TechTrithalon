package lk.techtrithalon.waypoint.fleetops.infrastructure;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.fleetops.application.FleetRepository;
import lk.techtrithalon.waypoint.fleetops.domain.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
@Repository
class JdbcFleetRepository implements FleetRepository {
    private final JdbcTemplate db;
    JdbcFleetRepository(JdbcTemplate db) { this.db=db; }
    public void lockPlanningFuel(String id,int year,int week) {
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"fuel:"+id+":"+year+":"+week);
    }
    public void lockAvailability(String id,LocalDate date) {
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"availability:"+id+":"+date);
    }
    public boolean commitPlanningFuel(String id,int year,int week,BigDecimal amount,BigDecimal quota) {
        return !db.query("""
            INSERT INTO fuel_ledger(vehicle_id,iso_year,iso_week,litres_committed)
            SELECT ?,?,?,? WHERE ?::numeric<=?::numeric
            ON CONFLICT(vehicle_id,iso_year,iso_week) DO UPDATE
              SET litres_committed=fuel_ledger.litres_committed+EXCLUDED.litres_committed
              WHERE fuel_ledger.litres_committed+EXCLUDED.litres_committed<=?::numeric
            RETURNING vehicle_id
            """,(rs,i) -> rs.getString(1),id,year,week,amount,amount,quota,quota).isEmpty();
    }
    public boolean releasePlanningFuel(String id,int year,int week,BigDecimal amount) {
        return db.update("UPDATE fuel_ledger SET litres_committed=litres_committed-? WHERE vehicle_id=? AND iso_year=? AND iso_week=? AND litres_committed>=?",
            amount,id,year,week,amount)==1;
    }
    private static final RowMapper<VehicleAvailability> AVAILABILITY = (rs,i) -> new VehicleAvailability(
        rs.getString("vehicle_id"),rs.getDate("date").toLocalDate(),rs.getString("status"),rs.getString("note"),
        rs.getLong("version"),rs.getTimestamp("updated_at").toInstant(),rs.getLong("updated_by"),true);
    private static final RowMapper<FleetVehicle> FLEET = (rs,i) -> new FleetVehicle(
        rs.getString("vehicle_id"), rs.getString("type"), rs.getString("temp"),
        rs.getBigDecimal("weight_cap_kg"), rs.getBigDecimal("volume_cap_m3"), rs.getString("fuel_type"),
        rs.getBigDecimal("km_per_l"), rs.getBigDecimal("weekly_fuel_quota_l"), rs.getString("depot"),
        rs.getDate("as_of").toLocalDate(),
        rs.getString("availability_status"), rs.getString("availability_note"),
        rs.getLong("availability_version"), rs.getBoolean("availability_recorded"));
    public Optional<VehicleAvailability> availability(String id,LocalDate date) {
        return db.query("SELECT * FROM vehicle_availability WHERE vehicle_id=? AND date=?",AVAILABILITY,id,Date.valueOf(date)).stream().findFirst();
    }
    public Optional<VehicleAvailability> update(String id,LocalDate date,String status,String note,long expected,long actor,Instant at) {
        return db.query("""
            INSERT INTO vehicle_availability (vehicle_id,date,status,note,version,updated_by,updated_at)
            SELECT ?,?,?,?,1,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM vehicle_availability WHERE vehicle_id=? AND date=?)
            ON CONFLICT (vehicle_id,date) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,
                version=vehicle_availability.version+1,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at
            WHERE vehicle_availability.version=? RETURNING *
            """,AVAILABILITY,id,Date.valueOf(date),status,note,actor,Timestamp.from(at),expected,id,Date.valueOf(date),expected).stream().findFirst();
    }
    public Optional<FuelBalance> fuel(String id,int year,int week,BigDecimal quota) {
        return db.query("""
            SELECT *, ?::numeric AS quota, ?::numeric-litres_committed AS remaining
            FROM fuel_ledger WHERE vehicle_id=? AND iso_year=? AND iso_week=?
            """,(rs,i) -> new FuelBalance(id,year,week,rs.getBigDecimal("quota"),rs.getBigDecimal("litres_committed"),
                rs.getBigDecimal("litres_actual"),rs.getBigDecimal("remaining"),true),quota,quota,id,year,week).stream().findFirst();
    }
    public List<FleetVehicle> fleet(String depot, LocalDate date) {
        return db.query("""
            SELECT v.*, ?::date AS as_of,
              a.status AS availability_status, a.note AS availability_note,
              COALESCE(a.version, 0) AS availability_version,
              (a.vehicle_id IS NOT NULL) AS availability_recorded
            FROM vehicle v
            LEFT JOIN vehicle_availability a ON a.vehicle_id=v.vehicle_id AND a.date=?
            WHERE (?::text IS NULL OR v.depot=?)
            ORDER BY v.vehicle_id
            """, FLEET, Date.valueOf(date), Date.valueOf(date), depot, depot);
    }
    public Optional<FleetVehicle> fleetVehicle(String vehicleId, LocalDate date) {
        return db.query("""
            SELECT v.*, ?::date AS as_of,
              a.status AS availability_status, a.note AS availability_note,
              COALESCE(a.version, 0) AS availability_version,
              (a.vehicle_id IS NOT NULL) AS availability_recorded
            FROM vehicle v
            LEFT JOIN vehicle_availability a ON a.vehicle_id=v.vehicle_id AND a.date=?
            WHERE v.vehicle_id=?
            """, FLEET, Date.valueOf(date), Date.valueOf(date), vehicleId).stream().findFirst();
    }
}
