package lk.techtrithalon.waypoint.identity.application;

import java.util.Optional;
import lk.techtrithalon.waypoint.identity.domain.UserAccount;

public interface UserRepository {
    Optional<UserAccount> findByUsername(String username);
    boolean existsByUsername(String username);
    void insert(UserAccount account);
    /** Links a driver to a vehicle once; an existing link is never overwritten by seeding. */
    void linkVehicleIfUnset(String username, String vehicleId);
    Optional<lk.techtrithalon.waypoint.identity.domain.AssignedDriver> activeDriverForVehicle(String vehicleId);
}
