package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;

/**
 * Self-contained input for evaluating planning rules and metrics.
 */
public record PlanContext(
    LocalDate planDate,
    String depot,
    List<PlanOrder> orders,
    List<PlanVehicle> vehicles,
    List<PlanTrip> trips,
    Map<String, DistrictTravel> travelByDistrict,
    Map<String, Map<String, ServiceAllowance>> serviceByBrandDock,
    Map<String, BigDecimal> fuelCommittedThisWeek,
    CalendarDay calendar,
    PlanConstraintParams constraintParams
) {
    public PlanContext {
        orders = orders != null ? Collections.unmodifiableList(orders) : Collections.emptyList();
        vehicles = vehicles != null ? Collections.unmodifiableList(vehicles) : Collections.emptyList();
        trips = trips != null ? Collections.unmodifiableList(trips) : Collections.emptyList();
        travelByDistrict = travelByDistrict != null ? Collections.unmodifiableMap(travelByDistrict) : Collections.emptyMap();
        serviceByBrandDock = serviceByBrandDock != null ? Collections.unmodifiableMap(serviceByBrandDock) : Collections.emptyMap();
        fuelCommittedThisWeek = fuelCommittedThisWeek != null ? Collections.unmodifiableMap(fuelCommittedThisWeek) : Collections.emptyMap();
    }
}
