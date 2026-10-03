package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

/** Deferrals published for one planning run with server-computed totals. */
public record DeferralRun(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) LocalDate planDate,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String depot,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int deferredOrders,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int protectedNextRun,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Deferrals that extend a consecutive skip") int repeatSkips,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int storesNotified,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int storesAcknowledged,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<DeferralRecord> items
) {
    public static DeferralRun of(LocalDate date, String depot, List<DeferralRecord> items) {
        return new DeferralRun(date, depot, items.size(),
            (int) items.stream().filter(DeferralRecord::protectNextRun).count(),
            (int) items.stream().filter(d -> d.consecutiveDeferrals() > 1).count(),
            (int) items.stream().filter(DeferralRecord::notifyStore).count(),
            (int) items.stream().filter(d -> d.notifyStore() && d.acknowledgedAt() != null).count(),
            items);
    }
}
