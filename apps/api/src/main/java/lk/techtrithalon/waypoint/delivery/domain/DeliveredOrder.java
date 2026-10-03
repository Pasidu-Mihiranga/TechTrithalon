package lk.techtrithalon.waypoint.delivery.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

/** What the driver recorded for one order, as other modules may read it. */
@Schema(name="DeliveredOrder")
public record DeliveredOrder(long orderId, long recordId, String outcome, int orderedUnits, int loadedUnits, int deliveredUnits,
                             @Schema(nullable=true) String issueKind, @Schema(nullable=true) String recipientName,
                             Instant occurredAt, int photos, int signatures) {}
