package lk.techtrithalon.waypoint.ordering.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

/**
 * Dispatcher home figures. Values that belong to later phases are marked unavailable so the UI can
 * show an honest empty state instead of inventing numbers.
 */
public record DashboardSnapshot(
    LocalDate date,
    String depot,
    Metric ordersToPlan,
    Metric ordersPlanned,
    Metric tripsReady,
    Metric activeTrips,
    Metric exceptions,
    List<AttentionItem> orderAttention,
    List<AttentionItem> tripAttention,
    PlanningProgress planningProgress
) {
    /** The same snapshot with the figures the delivery and exceptions modules own filled in. */
    public DashboardSnapshot withOperations(Metric tripsReady, Metric activeTrips, Metric exceptions) {
        return new DashboardSnapshot(date, depot, ordersToPlan, ordersPlanned, tripsReady, activeTrips, exceptions, orderAttention, tripAttention, planningProgress);
    }

    public record Metric(
        @Schema(nullable = true) Integer value,
        boolean available,
        @Schema(nullable = true) String availableFromPhase
    ) {
        public static Metric of(int value) { return new Metric(value, true, null); }
        public static Metric later(String phase) { return new Metric(null, false, phase); }
    }

    public record AttentionItem(String id, String label, String reason) {}

    public record PlanningProgress(
        boolean available,
        @Schema(nullable = true) Integer planned,
        @Schema(nullable = true) Integer total,
        @Schema(nullable = true) String availableFromPhase
    ) {
        public static PlanningProgress of(int planned, int total) {
            return new PlanningProgress(true, planned, total, null);
        }

        public static PlanningProgress later(String phase) {
            return new PlanningProgress(false, null, null, phase);
        }
    }
}
