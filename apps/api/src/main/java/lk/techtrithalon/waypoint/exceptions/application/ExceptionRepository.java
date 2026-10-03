package lk.techtrithalon.waypoint.exceptions.application;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import lk.techtrithalon.waypoint.exceptions.domain.OperationalException;

public interface ExceptionRepository {
    List<OperationalException> find(String sourceType, Collection<String> sourceIds);

    /** Takes the item (creating its state row if needed). False when it is already resolved. */
    boolean claim(String sourceType, String sourceId, long actor, String actorName, Instant at);

    /**
     * Closes an item that has no workflow of its own. {@code expectedVersion} is 0 when no state row exists
     * yet. False when the version no longer matches or the item is already resolved.
     */
    boolean resolve(String sourceType, String sourceId, int expectedVersion, long actor, String actorName, String note, Instant at);

    /** Records that the owning module's own decision closed the item. */
    void markResolved(String sourceType, String sourceId, long actor, String actorName, String note, Instant at);
}
