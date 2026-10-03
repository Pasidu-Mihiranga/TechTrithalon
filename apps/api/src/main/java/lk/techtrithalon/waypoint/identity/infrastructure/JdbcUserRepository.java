package lk.techtrithalon.waypoint.identity.infrastructure;

import java.util.Optional;
import lk.techtrithalon.waypoint.identity.application.UserRepository;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.identity.domain.UserAccount;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcUserRepository implements UserRepository {
    private static final RowMapper<UserAccount> MAPPER = (rs, i) -> new UserAccount(
        rs.getLong("id"), rs.getString("username"), rs.getString("display_name"), rs.getString("password_hash"),
        Role.valueOf(rs.getString("role")), rs.getString("outlet_id"), rs.getString("depot"), rs.getBoolean("active"));

    private final JdbcTemplate db;

    JdbcUserRepository(JdbcTemplate db) { this.db = db; }

    @Override
    public Optional<UserAccount> findByUsername(String username) {
        return db.query("SELECT * FROM app_user WHERE lower(username) = lower(?)", MAPPER, username).stream().findFirst();
    }

    @Override
    public boolean existsByUsername(String username) {
        Boolean exists = db.queryForObject("SELECT EXISTS (SELECT 1 FROM app_user WHERE lower(username) = lower(?))", Boolean.class, username);
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public void insert(UserAccount a) {
        db.update("""
            INSERT INTO app_user (username, display_name, password_hash, role, outlet_id, depot, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, a.username(), a.displayName(), a.passwordHash(), a.role().name(), a.outletId(), a.depot(), a.active());
    }

    @Override
    public void linkVehicleIfUnset(String username, String vehicleId) {
        db.update("UPDATE app_user SET vehicle_id=? WHERE lower(username)=lower(?) AND role='DRIVER' AND vehicle_id IS NULL",
            vehicleId, username);
    }

    @Override
    public Optional<lk.techtrithalon.waypoint.identity.domain.AssignedDriver> activeDriverForVehicle(String vehicleId) {
        return db.query("SELECT id, display_name FROM app_user WHERE vehicle_id=? AND role='DRIVER' AND active",
            (rs, i) -> new lk.techtrithalon.waypoint.identity.domain.AssignedDriver(rs.getLong("id"), rs.getString("display_name")),
            vehicleId).stream().findFirst();
    }
}
