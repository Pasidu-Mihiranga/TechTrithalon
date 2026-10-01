package lk.techtrithalon.waypoint.fleetops.infrastructure;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
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
    private static final RowMapper<VehicleAvailability> AVAILABILITY = (rs,i) -> new VehicleAvailability(
        rs.getString("vehicle_id"),rs.getDate("date").toLocalDate(),rs.getString("status"),rs.getString("note"),
        rs.getLong("version"),rs.getTimestamp("updated_at").toInstant(),rs.getLong("updated_by"),true);
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
}
