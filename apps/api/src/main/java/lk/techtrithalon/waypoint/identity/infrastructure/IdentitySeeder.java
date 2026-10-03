package lk.techtrithalon.waypoint.identity.infrastructure;

import lk.techtrithalon.waypoint.identity.application.SecurityProperties;
import lk.techtrithalon.waypoint.identity.application.UserRepository;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.identity.domain.UserAccount;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Creates the four initial accounts. Idempotent: an existing username is left untouched (so a changed
 * environment password never silently resets a live account). Passwords come only from configuration.
 * Runs after the reference data import, because a store manager references an outlet.
 */
@Component
@Order(20)
@ConditionalOnProperty(name = "app.security.seed.enabled", havingValue = "true", matchIfMissing = true)
class IdentitySeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(IdentitySeeder.class);
    static final int MIN_PASSWORD_LENGTH = 12;

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final SecurityProperties.Seed seed;
    private final TransactionTemplate tx;

    IdentitySeeder(UserRepository users, PasswordEncoder encoder, SecurityProperties properties, TransactionTemplate tx) {
        this.users = users;
        this.encoder = encoder;
        this.seed = properties.seed();
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        tx.executeWithoutResult(status -> {
            create(Role.DISPATCHER, seed.dispatcher());
            create(Role.STORE_MANAGER, seed.storeManager());
            create(Role.LOADER, seed.loader());
            create(Role.DRIVER, seed.driver());
            if (!isBlank(seed.driver().vehicleId())) linkDriverVehicle(seed.driver());
        });
    }

    private void create(Role role, SecurityProperties.Account account) {
        if (account == null || isBlank(account.username())) {
            throw new IllegalStateException("Seed account for " + role + " has no username");
        }
        if (users.existsByUsername(account.username())) return;
        if (isBlank(account.password()) || account.password().length() < MIN_PASSWORD_LENGTH || account.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Seed password for " + role + " (" + account.username() + ") must be set and at least "
                + MIN_PASSWORD_LENGTH + " characters and at most 72 UTF-8 bytes. Copy .env.example to .env and set the SEED_*_PASSWORD values.");
        }
        users.insert(new UserAccount(0, account.username(), account.displayName(), encoder.encode(account.password()),
            role, blankToNull(account.outletId()), blankToNull(account.depot()), true));
        log.info("Created {} account '{}'", role, account.username());
    }

    private void linkDriverVehicle(SecurityProperties.Account driver) {
        try {
            users.linkVehicleIfUnset(driver.username(), driver.vehicleId());
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new IllegalStateException("SEED_DRIVER_VEHICLE " + driver.vehicleId()
                + " is not a known vehicle, or another active driver is already linked to it", e);
        }
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
    private static String blankToNull(String s) { return isBlank(s) ? null : s; }
}
