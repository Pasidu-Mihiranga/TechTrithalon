package lk.techtrithalon.waypoint.sync.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Map;
import java.util.UUID;

/** What happened to one action. DUPLICATE repeats the stored outcome of an action already received. */
@Schema(name="SyncResult")
public record SyncResult(UUID clientActionId,
                         @Schema(description="APPLIED, DUPLICATE, CONFLICT or REJECTED") String result,
                         @Schema(nullable=true, description="Server code: ALREADY_APPLIED, or the rule that stopped the action") String code,
                         @Schema(nullable=true) String message,
                         @Schema(nullable=true, description="Applied, but the dispatcher reviews it: ORDER_NOT_ON_TRIP, STOP_NOT_ON_TRIP, PROOF_MISSING") String review,
                         @Schema(nullable=true, description="Facts for the conflict screen (for example both records)") Map<String, Object> detail,
                         @Schema(description="The device time is implausibly far from the server's; it is kept as reported") boolean clockSkew) {}
