package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;

/**
 * Computes high-level operational metrics for a planned schedule.
 */
public class PlanMetricsCalculator {

    private final DistanceFuelCalculator distanceFuelCalculator = new DistanceFuelCalculator();

    public PlanMetrics compute(PlanContext ctx) {
        return compute(ctx, 0);
    }

    public PlanMetrics compute(PlanContext ctx, int hardViolationCount) {
        if (ctx == null) {
            return new PlanMetrics(
                0, 0, 0, 0,
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                hardViolationCount
            );
        }

        Map<String, PlanVehicle> vehicleMap = (ctx.vehicles() != null)
            ? ctx.vehicles().stream().collect(Collectors.toMap(PlanVehicle::vehicleId, Function.identity(), (v1, v2) -> v1))
            : Map.of();

        Set<Long> assignedOrderIds = new HashSet<>();
        Set<String> vehiclesUsed = new HashSet<>();
        int tripsUsed = 0;

        BigDecimal totalDistanceKm = BigDecimal.ZERO;
        BigDecimal totalFuelLitres = BigDecimal.ZERO;

        BigDecimal sumVolumeUtilPercent = BigDecimal.ZERO;
        BigDecimal sumWeightUtilPercent = BigDecimal.ZERO;
        int activeTripCount = 0;

        List<PlanTrip> trips = ctx.trips() != null ? ctx.trips() : List.of();

        for (PlanTrip trip : trips) {
            if (trip.stops() == null || trip.stops().isEmpty()) {
                continue;
            }

            tripsUsed++;
            if (trip.vehicleId() != null) {
                vehiclesUsed.add(trip.vehicleId());
            }

            BigDecimal tripVolume = BigDecimal.ZERO;
            BigDecimal tripWeight = BigDecimal.ZERO;

            for (PlanStop stop : trip.stops()) {
                if (stop.order() != null) {
                    assignedOrderIds.add(stop.order().id());
                    if (stop.order().volumeM3() != null) {
                        tripVolume = tripVolume.add(stop.order().volumeM3());
                    }
                    if (stop.order().weightKg() != null) {
                        tripWeight = tripWeight.add(stop.order().weightKg());
                    }
                } else if (stop.orderId() > 0) {
                    assignedOrderIds.add(stop.orderId());
                }
            }

            PlanVehicle vehicle = vehicleMap.get(trip.vehicleId());

            // Distance and fuel
            BigDecimal distance = trip.distanceKm();
            BigDecimal fuel = trip.fuelLitres();
            if (distance == null || fuel == null) {
                DistrictTravel travel = ctx.travelByDistrict() != null ? ctx.travelByDistrict().get(trip.district()) : null;
                DistanceFuelCalculator.TripDistanceFuel df = distanceFuelCalculator.compute(trip, travel, vehicle);
                distance = df.distanceKm();
                fuel = df.fuelLitres();
            }

            if (distance != null) {
                totalDistanceKm = totalDistanceKm.add(distance);
            }
            if (fuel != null) {
                totalFuelLitres = totalFuelLitres.add(fuel);
            }

            // Utilisation
            if (vehicle != null) {
                if (vehicle.volumeCapM3() != null && vehicle.volumeCapM3().compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal volUtil = tripVolume.multiply(BigDecimal.valueOf(100))
                        .divide(vehicle.volumeCapM3(), 2, RoundingMode.HALF_UP);
                    sumVolumeUtilPercent = sumVolumeUtilPercent.add(volUtil);
                }
                if (vehicle.weightCapKg() != null && vehicle.weightCapKg().compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal wtUtil = tripWeight.multiply(BigDecimal.valueOf(100))
                        .divide(vehicle.weightCapKg(), 2, RoundingMode.HALF_UP);
                    sumWeightUtilPercent = sumWeightUtilPercent.add(wtUtil);
                }
                activeTripCount++;
            }
        }

        int totalOrders = ctx.orders() != null ? ctx.orders().size() : 0;
        int ordersAssigned = assignedOrderIds.size();
        int ordersUnassigned = Math.max(0, totalOrders - ordersAssigned);

        BigDecimal avgVolumeUtil = activeTripCount > 0
            ? sumVolumeUtilPercent.divide(BigDecimal.valueOf(activeTripCount), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        BigDecimal avgWeightUtil = activeTripCount > 0
            ? sumWeightUtilPercent.divide(BigDecimal.valueOf(activeTripCount), 2, RoundingMode.HALF_UP)
            : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        return new PlanMetrics(
            ordersAssigned,
            ordersUnassigned,
            vehiclesUsed.size(),
            tripsUsed,
            totalDistanceKm.setScale(2, RoundingMode.HALF_UP),
            totalFuelLitres.setScale(2, RoundingMode.HALF_UP),
            avgVolumeUtil,
            avgWeightUtil,
            hardViolationCount
        );
    }
}
