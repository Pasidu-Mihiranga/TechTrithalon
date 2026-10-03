package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Read model for the board. All metrics and stop times are computed by Spring. */
public record ManualPlanView(@Schema(requiredMode=Schema.RequiredMode.REQUIRED) ManualPlan plan,
                             PlanValidationReport validation, List<PlanTrip> trips,
                             List<UnassignedOrder> unassignedOrders, List<PlanVehicle> fleet,
                             Map<Long, TripLoad> utilisation, Map<String, VehicleUse> vehicleUtilisation,
                             @Schema(description="Repeat-skip evidence for every order in the run, keyed by order ID")
                             Map<Long, OrderFairness> fairness) {
    public record UnassignedOrder(PlanOrder order, String disposition, String reason,
                                  java.time.LocalDate nextDeliveryDate,
                                  @Schema(nullable=true) String reasonCode, boolean protectNextRun, boolean notifyStore,
                                  @Schema(nullable=true) String decidedByName,
                                  @Schema(nullable=true) java.time.Instant decidedAt) {}
    public record TripLoad(BigDecimal volumeUsedM3, BigDecimal volumeLimitM3,
                           BigDecimal weightUsedKg, BigDecimal weightLimitKg,
                           BigDecimal volumeUtilisationPct, int stopCount) {}
    public record VehicleUse(int freshMinutesUsed, int freshMinutesLimit,
                             int otherMinutesUsed, int otherMinutesLimit,
                             BigDecimal fuelCommittedBeforeL, BigDecimal fuelForPlanL, BigDecimal weeklyFuelLimitL) {}
}
