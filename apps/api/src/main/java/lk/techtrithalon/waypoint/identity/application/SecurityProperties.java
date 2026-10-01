package lk.techtrithalon.waypoint.identity.application;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param sessionTtl      absolute session lifetime; longer than any shift (a driver can lose coverage mid-route)
 * @param cookieName      name of the session cookie
 * @param cookieSecure    send the cookie only over HTTPS; false only for plain-http local development
 * @param bcryptCost      BCrypt work factor (tests lower it for speed)
 * @param allowedOrigins  browser origins allowed to call the API; also checked on every state-changing request
 * @param loginMaxFailures failed attempts per user+address before sign-in is blocked
 * @param loginWindow     how long failures are remembered, and how long a block lasts
 */
@ConfigurationProperties("app.security")
public record SecurityProperties(
    Duration sessionTtl,
    String cookieName,
    boolean cookieSecure,
    int bcryptCost,
    List<String> allowedOrigins,
    int loginMaxFailures,
    Duration loginWindow,
    Seed seed
) {
    /** Initial accounts, one per role. Passwords always come from the environment, never from the repository. */
    public record Seed(boolean enabled, Account dispatcher, Account storeManager, Account loader, Account driver) {}

    public record Account(String username, String displayName, String password, String outletId, String depot) {}
}
