package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

/**
 * Repeat-skip evidence for one order in one planning run. Derived from deferral history and
 * the source facts imported with scenario orders; never a stored counter.
 */
public record OrderFairness(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long orderId,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "Outlet was deferred on the previous operating day (history or source data)")
    boolean deferredPreviousOperatingDay,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "Consecutive operating days the outlet was skipped up to the previous run")
    int priorConsecutiveDeferrals,
    @Schema(nullable = true) LocalDate lastDeferralDate,
    @Schema(nullable = true, description = "From imported scenario data; null when not supplied")
    Integer daysSinceLastServed,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "history, source, history+source or none: where the repeat-skip evidence came from")
    String evidenceSource,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "Carried into this run by an earlier published deferral")
    boolean carriedForward,
    @Schema(nullable = true) LocalDate carriedFromDate,
    @Schema(nullable = true) String carriedReasonCode,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED,
        description = "Carried forward with protect-on-next-run set")
    boolean protectedThisRun
) {}
