package lk.techtrithalon.waypoint.exceptions.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** The dispatcher's exceptions queue: one list over loading, driver, offline and receipt problems. */
public final class ExceptionViews {
    private ExceptionViews() {}

    public static final List<String> TYPES = List.of("LOADING_ISSUE", "RECEIPT_DISCREPANCY", "DELIVERY_PROBLEM", "SYNC_REVIEW");

    @Schema(name="ExceptionQueue")
    public record Queue(LocalDate date, String depot, @Schema(description="Server time of this snapshot") Instant asOf,
                        Counts counts, List<Item> items) {}

    @Schema(name="ExceptionCounts")
    public record Counts(int all, int open, int inProgress, int resolved) {
        public static final Counts NONE = new Counts(0, 0, 0, 0);
        public Counts plus(Counts o) { return new Counts(all + o.all, open + o.open, inProgress + o.inProgress, resolved + o.resolved); }
        /** Items still waiting for the dispatcher (not yet resolved). */
        public int unresolved() { return open + inProgress; }
    }

    @Schema(name="ExceptionItem")
    public record Item(@Schema(description="TYPE:sourceId, unique in the queue") String id,
                       @Schema(description="LOADING_ISSUE, RECEIPT_DISCREPANCY, DELIVERY_PROBLEM or SYNC_REVIEW") String sourceType,
                       String sourceId,
                       @Schema(description="LOADING_SHORTFALL, RECEIPT_DISPUTE, DELIVERY_PARTIAL, DELIVERY_FAILED, DELIVERY_REVIEW, SYNC_CONFLICT, SYNC_REJECTED, ROUTE_CHANGED_OFFLINE or STOP_NOT_ON_TRIP") String kind,
                       String title, String detail,
                       @Schema(nullable=true) String orderRef, @Schema(nullable=true) String outletId,
                       @Schema(nullable=true) String vehicleId, @Schema(nullable=true) Integer tripIndex,
                       @Schema(nullable=true) String driverName, @Schema(nullable=true) LocalDate planDate,
                       @Schema(nullable=true) String reportedByName, Instant reportedAt,
                       @Schema(description="OPEN, IN_PROGRESS or RESOLVED") String status,
                       @Schema(nullable=true, description="Dispatcher who took it") String ownerName,
                       @Schema(nullable=true) Instant claimedAt,
                       @Schema(description="Decisions the dispatcher may choose; empty means the item is closed by acknowledging it with a note") List<String> decisions,
                       @Schema(nullable=true) String decision, @Schema(nullable=true) String resolutionNote,
                       @Schema(nullable=true) String resolvedByName, @Schema(nullable=true) Instant resolvedAt,
                       @Schema(description="Send this as expectedVersion when resolving") int version) {}
}
