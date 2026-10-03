package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

/** One append-only deferral decision, as recorded at publication. */
public record DeferralRecord(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long id,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long orderId,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String orderRef,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String outletId,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String brand,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String tempRequirement,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long planId,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) LocalDate planDate,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) LocalDate nextPlanningDate,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String depot,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String reasonCode,
    @Schema(nullable = true) String ruleCode,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String reason,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean protectNextRun,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean notifyStore,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int consecutiveDeferrals,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Map<String, Object> evidence,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String decidedByName,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant decidedAt,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant recordedAt,
    @Schema(nullable = true) Instant acknowledgedAt,
    @Schema(nullable = true, description = "Current order status; filled by the service, not stored") String currentOrderStatus
) {
    public DeferralRecord withStatus(String status) {
        return new DeferralRecord(id, orderId, orderRef, outletId, brand, tempRequirement, planId, planDate,
            nextPlanningDate, depot, reasonCode, ruleCode, reason, protectNextRun, notifyStore, consecutiveDeferrals,
            evidence, decidedByName, decidedAt, recordedAt, acknowledgedAt, status);
    }
    /** Figma reason codes mapped to the named constraint they cite; OTHER is free text. */
    public static String ruleFor(String reasonCode) {
        return switch (reasonCode) {
            case "CAPACITY" -> "TRIP_CAPACITY";
            case "NO_REEFER" -> "TEMPERATURE_COMPATIBILITY";
            case "WINDOW_CONFLICT" -> "DELIVERY_WINDOW";
            case "VAN_ACCESS" -> "VEHICLE_ACCESS";
            default -> null;
        };
    }
}
