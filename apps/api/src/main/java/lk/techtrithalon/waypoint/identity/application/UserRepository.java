package lk.techtrithalon.waypoint.identity.application;

import java.util.Optional;
import lk.techtrithalon.waypoint.identity.domain.UserAccount;

public interface UserRepository {
    Optional<UserAccount> findByUsername(String username);
    boolean existsByUsername(String username);
    void insert(UserAccount account);
}
