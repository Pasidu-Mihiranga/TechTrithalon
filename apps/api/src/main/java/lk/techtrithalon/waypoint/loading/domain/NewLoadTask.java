package lk.techtrithalon.waypoint.loading.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** What publication hands to loading for one trip; lines are in stop order. */
public record NewLoadTask(long planId, int planVersion, long tripId, LocalDate planDate, String depot, String vehicleId,
                          int tripIndex, String brand, String district, LocalTime plannedDepart, Long driverUserId,
                          List<Line> lines) {
    public NewLoadTask { lines = List.copyOf(lines); }

    public record Line(long orderId, String orderRef, String outletId, String tempRequirement, int units,
                       BigDecimal weightKg, BigDecimal volumeM3, int stopSeq) {}
}
