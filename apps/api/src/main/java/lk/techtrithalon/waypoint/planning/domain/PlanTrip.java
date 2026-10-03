package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

/**
 * A scheduled vehicle trip composed of ordered delivery stops.
 */
public record PlanTrip(
    long id,
    String vehicleId,
    int tripIndex,
    String brand,
    String district,
    List<PlanStop> stops,
    Integer tripMinutes,
    BigDecimal distanceKm,
    BigDecimal fuelLitres
) {
    public PlanTrip {
        stops = stops != null ? Collections.unmodifiableList(stops) : Collections.emptyList();
    }
}
