package lk.techtrithalon.waypoint.planning.domain;

import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;

/**
 * Calculates trip duration in minutes.
 *
 * <p><strong>COMPETITION RULE</strong> (booklet p.20, verified by the 101 / 112 / 213 fixtures):
 * <pre>
 * trip_minutes = depot_to_district_freeflow_min
 *              + inter_stop_freeflow_min * (stop_count - 1)
 *              + sum service_allowance_min[brand][outlet.dock_type]
 * </pre>
 * The return journey is not added: "the stated budgets already allow for it". Waiting for a window
 * to open is not part of the formula either, so it is not counted against the 270 / 480 budgets.
 *
 * <p>Stop order never changes this value: one trip serves one district, and every inter-stop leg
 * uses that district's constant. Distance and fuel are calculated separately, under a Waypoint
 * assumption described in {@link DistanceFuelCalculator}.
 */
public class TripTimeCalculator {

    public int compute(PlanTrip trip, DistrictTravel travel, Map<String, Map<String, ServiceAllowance>> serviceByBrandDock) {
        if (trip == null || trip.stops().isEmpty()) {
            return 0;
        }
        return compute(trip.brand(), travel, trip.stops(), serviceByBrandDock);
    }

    public int compute(
        String tripBrand,
        DistrictTravel travel,
        List<PlanStop> stops,
        Map<String, Map<String, ServiceAllowance>> serviceByBrandDock
    ) {
        if (stops == null || stops.isEmpty()) {
            return 0;
        }

        int depotToDistrictMin = travel != null ? travel.depotToDistrictMinutes() : 0;
        int interStopMin = travel != null ? travel.interStopMinutes() : 0;
        int stopCount = stops.size();

        int travelMinutes = depotToDistrictMin + (interStopMin * (stopCount - 1));

        int serviceMinutes = 0;
        for (PlanStop stop : stops) {
            String brand = (stop.order() != null && stop.order().brand() != null)
                ? stop.order().brand()
                : tripBrand;
            String dockType = (stop.order() != null) ? stop.order().dockType() : null;
            serviceMinutes += getServiceAllowanceMinutes(serviceByBrandDock, brand, dockType);
        }

        return travelMinutes + serviceMinutes;
    }

    public int getServiceAllowanceMinutes(
        Map<String, Map<String, ServiceAllowance>> serviceByBrandDock,
        String brand,
        String dockType
    ) {
        if (serviceByBrandDock == null || brand == null || dockType == null) {
            return 0;
        }

        // Direct lookup
        Map<String, ServiceAllowance> byDock = serviceByBrandDock.get(brand);
        if (byDock == null) {
            // Case-insensitive fallback for brand
            for (Map.Entry<String, Map<String, ServiceAllowance>> entry : serviceByBrandDock.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(brand)) {
                    byDock = entry.getValue();
                    break;
                }
            }
        }

        if (byDock == null) {
            return 0;
        }

        ServiceAllowance allowance = byDock.get(dockType);
        if (allowance == null) {
            // Case-insensitive fallback for dock type
            for (Map.Entry<String, ServiceAllowance> entry : byDock.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(dockType)) {
                    allowance = entry.getValue();
                    break;
                }
            }
        }

        return allowance != null ? allowance.minutes() : 0;
    }
}
