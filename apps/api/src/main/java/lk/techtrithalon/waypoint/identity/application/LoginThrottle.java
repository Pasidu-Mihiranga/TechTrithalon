package lk.techtrithalon.waypoint.identity.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Independent username and address buckets prevent rotating either one to bypass the limit. */
@Component
public class LoginThrottle {
    private final Map<String, Deque<Instant>> failures = new HashMap<>();
    private final Clock clock;
    private final int maxFailures;
    private final Duration window;

    public LoginThrottle(Clock clock, SecurityProperties properties) {
        this.clock = clock;
        this.maxFailures = properties.loginMaxFailures();
        this.window = properties.loginWindow();
    }

    private static String usernameKey(String username) { return "user:" + username.toLowerCase(Locale.ROOT); }
    private static String addressKey(String address) { return "address:" + address; }

    public synchronized Duration retryAfter(String username, String address) {
        Duration userWait = retryAfter(usernameKey(username));
        Duration addressWait = retryAfter(addressKey(address));
        return userWait.compareTo(addressWait) > 0 ? userWait : addressWait;
    }

    private Duration retryAfter(String key) {
        Deque<Instant> recent = failures.get(key);
        if (recent == null) return Duration.ZERO;
        prune(recent);
        if (recent.isEmpty()) failures.remove(key);
        if (recent.size() < maxFailures) return Duration.ZERO;
        return Duration.between(clock.instant(), recent.peekFirst().plus(window));
    }

    public synchronized void recordFailure(String username, String address) {
        for (String key : new String[] { usernameKey(username), addressKey(address) }) {
            Deque<Instant> recent = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
            prune(recent);
            recent.addLast(clock.instant());
        }
    }

    public synchronized void clear(String username, String address) {
        failures.remove(usernameKey(username));
        // A valid account must not reset failures for the address against other accounts.
    }

    @Scheduled(fixedDelayString = "PT1M")
    public synchronized void purge() {
        failures.values().forEach(this::prune);
        failures.values().removeIf(Deque::isEmpty);
    }

    private void prune(Deque<Instant> recent) {
        Instant cutoff = clock.instant().minus(window);
        while (!recent.isEmpty() && !recent.peekFirst().isAfter(cutoff)) recent.removeFirst();
    }
}
