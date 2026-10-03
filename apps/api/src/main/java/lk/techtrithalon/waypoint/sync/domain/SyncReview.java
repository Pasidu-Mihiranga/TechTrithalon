package lk.techtrithalon.waypoint.sync.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** A stored phone action the dispatcher should look at: it conflicted, was rejected, or was applied with a review reason. */
public record SyncReview(UUID clientActionId, long userId, String actionType, LocalDate planDate, int tripIndex,
                         @Schema(nullable=true) String entityId, String result, @Schema(nullable=true) String code,
                         @Schema(nullable=true) String message, @Schema(nullable=true) String review, boolean clockSkew,
                         Instant occurredAt, Instant receivedAt) {}
