package lk.techtrithalon.waypoint.exceptions.domain;

import java.time.Instant;

/** The dispatcher's handling state for one queue item; the item's facts stay with the module that owns them. */
public record OperationalException(long id, String sourceType, String sourceId, String status, Long claimedBy, String claimedByName,
                                   Instant claimedAt, Long resolvedBy, String resolvedByName, Instant resolvedAt, String note, int version) {}
