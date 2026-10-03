package lk.techtrithalon.waypoint.identity.application;

import java.util.Optional;
import lk.techtrithalon.waypoint.identity.domain.AssignedDriver;
import org.springframework.stereotype.Service;

/** Published identity lookup: which driver account drives a vehicle. Exposes no credentials or sessions. */
@Service
public class DriverDirectory {
    private final UserRepository users;
    public DriverDirectory(UserRepository users) { this.users = users; }

    public Optional<AssignedDriver> driverFor(String vehicleId) {
        return vehicleId == null ? Optional.empty() : users.activeDriverForVehicle(vehicleId);
    }
}
