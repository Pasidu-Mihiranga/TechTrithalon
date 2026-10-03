package lk.techtrithalon.waypoint.sync.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.IntStream;
import lk.techtrithalon.waypoint.delivery.application.DriverService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import lk.techtrithalon.waypoint.sync.domain.SyncAction;
import lk.techtrithalon.waypoint.sync.domain.SyncResponse;
import lk.techtrithalon.waypoint.sync.domain.SyncResult;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Replays the driver's outbox. Each action runs in its own transaction, in the order it happened on the
 * device: the action id is claimed first (so a retry is a DUPLICATE with the stored result, never a
 * second effect), then delegated to the delivery module, then its result is stored. A rule that stops
 * an action rolls its effect back and is stored as CONFLICT (state disagrees) or REJECTED (invalid).
 */
@Service
@PreAuthorize("hasRole('DRIVER')")
public class SyncService {
    /** Device times further than this from the server's are flagged, and kept as reported. */
    static final Duration FUTURE_SKEW = Duration.ofMinutes(5);
    static final Duration PAST_SKEW = Duration.ofHours(48);

    private final DriverService driver;
    private final SyncCommandRepository commands;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final Clock clock;

    public SyncService(DriverService driver, SyncCommandRepository commands, TransactionTemplate tx, ObjectMapper mapper, Clock clock) {
        this.driver = driver; this.commands = commands; this.tx = tx; this.mapper = mapper; this.clock = clock;
    }

    public SyncResponse sync(CurrentUser user, List<SyncAction> actions) {
        // Device order of occurrence; ties keep the order the phone sent them in.
        var order = IntStream.range(0, actions.size()).boxed()
            .sorted(Comparator.comparing((Integer i) -> actions.get(i).occurredAt()).thenComparing(i -> i)).toList();
        List<SyncResult> results = new ArrayList<>();
        for (int i : order) results.add(apply(user, actions.get(i)));
        return new SyncResponse(results, clock.instant());
    }

    private SyncResult apply(CurrentUser user, SyncAction action) {
        var stored = commands.find(action.clientActionId());
        if (stored.isPresent()) return duplicate(user, stored.get(), action);
        Instant now = clock.instant();
        boolean skew = action.occurredAt().isAfter(now.plus(FUTURE_SKEW)) || action.occurredAt().isBefore(now.minus(PAST_SKEW));
        String payload = json(action);
        try {
            var applied = tx.execute(status -> {
                if (!commands.claim(user.id(), action, payload, now, skew)) return null;
                var r = driver.applyField(user, command(action));
                var result = new SyncResult(action.clientActionId(), "APPLIED", r.alreadyApplied() ? "ALREADY_APPLIED" : null,
                    r.alreadyApplied() ? "Already recorded" : null, r.review(), null, skew);
                commands.saveResult(action.clientActionId(), result);
                return result;
            });
            if (applied != null) return applied;
            return commands.find(action.clientActionId()).map(s -> duplicate(user, s, action))
                .orElseThrow(() -> new IllegalStateException("Claimed sync action disappeared"));
        } catch (ApiException e) {
            var result = new SyncResult(action.clientActionId(), e.status() == HttpStatus.CONFLICT ? "CONFLICT" : "REJECTED", e.code(),
                e.getMessage(), null, e.properties().isEmpty() ? null : Map.copyOf(e.properties()), skew);
            return store(user, action, payload, now, skew, result);
        } catch (DataIntegrityViolationException e) {
            // Two devices changed the same thing at once, or the action names something that does not exist.
            var result = new SyncResult(action.clientActionId(), "CONFLICT", "CONCURRENT_UPDATE",
                "The trip changed at the same moment; sync again to see the current state", null, null, skew);
            return store(user, action, payload, now, skew, result);
        }
    }

    /** Stores a stopped action's result in a fresh transaction (its effect was rolled back). */
    private SyncResult store(CurrentUser user, SyncAction action, String payload, Instant now, boolean skew, SyncResult result) {
        try {
            Boolean claimed = tx.execute(status -> {
                if (!commands.claim(user.id(), action, payload, now, skew)) return false;
                commands.saveResult(action.clientActionId(), result);
                return true;
            });
            if (Boolean.TRUE.equals(claimed)) return result;
            return commands.find(action.clientActionId()).map(s -> duplicate(user, s, action)).orElse(result);
        } catch (DataIntegrityViolationException e) {
            return result; // for example a plan date that is not a calendar day: nothing to store against
        }
    }

    private static SyncResult duplicate(CurrentUser user, SyncCommandRepository.Stored stored, SyncAction action) {
        if (stored.userId() != user.id())
            return new SyncResult(action.clientActionId(), "REJECTED", "ACTION_ID_TAKEN", "This action id was used by another account", null, null, false);
        var r = stored.result();
        return new SyncResult(r.clientActionId(), "DUPLICATE", r.result().equals("APPLIED") ? Objects.requireNonNullElse(r.code(), "APPLIED") : r.code(),
            r.message(), r.review(), r.detail(), r.clockSkew());
    }

    private static DriverService.FieldCommand command(SyncAction a) {
        return new DriverService.FieldCommand(a.actionType(), a.planDate(), a.tripIndex(), a.planVersion(), a.outletId(), a.orderId(),
            a.outcome(), a.deliveredUnits(), a.issueKind(), a.recipientName(), a.notes(), a.proofUploadIds(), a.occurredAt());
    }

    private String json(SyncAction action) {
        try { return mapper.writeValueAsString(action); }
        catch (JsonProcessingException e) { throw new IllegalStateException(e); }
    }
}
