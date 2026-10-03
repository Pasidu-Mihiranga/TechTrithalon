package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * Calculates trip distance and fuel from the frozen district travel table.
 *
 * <pre>
 * distance_km = 2 * depot_to_district_km + inter_stop_km * (stop_count - 1)
 * fuel_litres = distance_km / vehicle.km_per_l
 * </pre>
 *
 * <p><strong>COMPETITION RULE:</strong> the booklet says only that "route distance consumes" the
 * weekly fuel quota, and gives {@code depot_to_district_km}, {@code inter_stop_km} and
 * {@code km_per_l}. It does not give a distance or fuel formula.
 *
 * <p><strong>WAYPOINT IMPLEMENTATION ASSUMPTION:</strong> the vehicle drives back to the depot, so
 * the outbound distance is counted twice. The booklet's trip-<em>time</em> rule excludes the return
 * journey ("the stated budgets already allow for it"); that statement is about time, not fuel.
 * Changing this assumption changes R9 results and needs the owner's approval (AGENTS.md section 2).
 */
public class DistanceFuelCalculator {

    private static final BigDecimal TWO = BigDecimal.valueOf(2);

    public record TripDistanceFuel(BigDecimal distanceKm, BigDecimal fuelLitres) {}

    public TripDistanceFuel compute(PlanTrip trip, DistrictTravel travel, PlanVehicle vehicle) {
        int stopCount = (trip != null && trip.stops() != null) ? trip.stops().size() : 0;
        return compute(stopCount, travel, vehicle != null ? vehicle.kmPerL() : null);
    }

    public TripDistanceFuel compute(int stopCount, DistrictTravel travel, BigDecimal kmPerL) {
        if (stopCount <= 0 || travel == null) {
            return new TripDistanceFuel(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        }

        BigDecimal depotToDistrictKm = travel.depotToDistrictKm() != null ? travel.depotToDistrictKm() : BigDecimal.ZERO;
        BigDecimal interStopKm = travel.interStopKm() != null ? travel.interStopKm() : BigDecimal.ZERO;

        BigDecimal distanceKm = depotToDistrictKm.multiply(TWO)
            .add(interStopKm.multiply(BigDecimal.valueOf(stopCount - 1)))
            .setScale(2, RoundingMode.HALF_UP);

        BigDecimal fuelLitres = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        if (kmPerL != null && kmPerL.compareTo(BigDecimal.ZERO) > 0) {
            fuelLitres = distanceKm.divide(kmPerL, 2, RoundingMode.HALF_UP);
        }

        return new TripDistanceFuel(distanceKm, fuelLitres);
    }
}
