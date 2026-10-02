package lk.techtrithalon.waypoint.identity.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.UserAccount;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository users;
    private final SessionRepository sessions;
    private final PasswordEncoder encoder;
    private final LoginThrottle throttle;
    private final Clock clock;
    private final SecurityProperties properties;
    /** Checked when the user does not exist, so unknown and known users take the same time to reject. */
    private final String dummyHash;

    public AuthService(UserRepository users, SessionRepository sessions, PasswordEncoder encoder,
                       LoginThrottle throttle, Clock clock, SecurityProperties properties) {
        this.users = users;
        this.sessions = sessions;
        this.encoder = encoder;
        this.throttle = throttle;
        this.clock = clock;
        this.properties = properties;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    /** A new session: the raw token for the cookie, plus the user. */
    public record LoginResult(String token, CurrentUser user) {}

    public LoginResult login(String username, String password, String address) {
        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Password must be at most 72 UTF-8 bytes");
        }
        Duration wait = throttle.retryAfter(username, address);
        if (!wait.isZero()) {
            log.warn("Sign-in blocked for '{}' from {}: too many failures", username, address);
            throw new TooManyAttemptsException(Math.max(1, wait.toSeconds()));
        }
        Optional<UserAccount> found = users.findByUsername(username);
        boolean matches = encoder.matches(password, found.map(UserAccount::passwordHash).orElse(dummyHash));
        if (found.isEmpty() || !matches || !found.get().active()) {
            throttle.recordFailure(username, address);
            log.info("Failed sign-in for '{}' from {}", username, address);
            // One message for every cause, so the response does not reveal which user IDs exist.
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Incorrect user ID or password");
        }
        throttle.clear(username, address);
        String token = SessionTokens.newToken();
        Instant now = clock.instant();
        sessions.create(SessionTokens.hash(token), found.get().id(), now, now.plus(properties.sessionTtl()));
        log.info("User '{}' ({}) signed in", found.get().username(), found.get().role());
        return new LoginResult(token, found.get().toCurrentUser());
    }

    /** The user behind a session token, or empty if it is unknown, revoked or expired. */
    public Optional<CurrentUser> resolve(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return sessions.findLiveUser(SessionTokens.hash(token), clock.instant());
    }

    public void logout(String token) {
        if (token == null || token.isBlank()) return;
        sessions.revoke(SessionTokens.hash(token), clock.instant());
    }

    /** Raised when sign-in is throttled; carries the wait for the Retry-After header. */
    public static class TooManyAttemptsException extends ApiException {
        private final long retryAfterSeconds;

        public TooManyAttemptsException(long retryAfterSeconds) {
            super(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Try again later.");
            this.retryAfterSeconds = retryAfterSeconds;
        }

        @Override
        public java.util.Map<String, String> headers() { return java.util.Map.of("Retry-After", Long.toString(retryAfterSeconds)); }
    }
}
