package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * Calculates operational distance and fuel consumption according to the competition booklet.
 *
 * <p>Formula:
 * <pre>
 * distance_km = 2 * depot_to_district_km + inter_stop_km * (stop_count - 1)
 * fuel_litres = distance_km / vehicle.km_per_l
 * </pre>
 *
 * <p><strong>Asymmetry Note:</strong> Unlike trip time, distance and fuel <em>INCLUDE</em>
 * the physical return leg to the depot (2 * depot_to_district_km).
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
