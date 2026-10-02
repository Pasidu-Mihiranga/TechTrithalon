package lk.techtrithalon.waypoint.planning.domain;

import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;

/**
 * Calculates planned stop arrivals, waiting times, and cascading service schedules.
 *
 * <p>Recurrence:
 * <pre>
 * arrival(stop 0) = tripDepart + depotToDistrictMinutes
 * serviceStart(0) = max(arrival(0), effectiveWindow(0).open)  // early arrival waits
 * serviceEnd(0)   = serviceStart(0) + serviceAllowance(0)
 *
 * arrival(stop k) = serviceEnd(k-1) + interStopMinutes
 * serviceStart(k) = max(arrival(k), effectiveWindow(k).open)
 * serviceEnd(k)   = serviceStart(k) + serviceAllowance(k)
 * </pre>
 *
 * <p><strong>Key Insight:</strong> Waiting at stop k pushes stop k+1 later, because
 * {@code serviceEnd(k)} drives the departure to the next stop, not {@code arrival(k)}.
 */
public class ArrivalCalculator {

    private final TripTimeCalculator tripTimeCalculator = new TripTimeCalculator();

    public record EffectiveWindow(LocalTime open, LocalTime close, boolean servable) {}

    public record ScheduledStop(
        PlanStop stop,
        LocalTime plannedArrival,
        LocalTime serviceStart,
        LocalTime serviceEnd,
        boolean isLate,
        long waitMinutes
    ) {}

    /**
     * Compute effective delivery window intersecting standard store window with mall delivery window.
     */
    public static EffectiveWindow computeEffectiveWindow(
        LocalTime windowOpen,
        LocalTime windowClose,
        LocalTime mallWindowOpen,
        LocalTime mallWindowClose
    ) {
        if (windowOpen == null || windowClose == null) {
            return new EffectiveWindow(windowOpen, windowClose, windowOpen != null || windowClose != null);
        }

        LocalTime effectiveOpen = windowOpen;
        if (mallWindowOpen != null && mallWindowOpen.isAfter(effectiveOpen)) {
            effectiveOpen = mallWindowOpen;
        }

        LocalTime effectiveClose = windowClose;
        if (mallWindowClose != null && mallWindowClose.isBefore(effectiveClose)) {
            effectiveClose = mallWindowClose;
        }

        boolean servable = !effectiveOpen.isAfter(effectiveClose);
        return new EffectiveWindow(effectiveOpen, effectiveClose, servable);
    }

    /**
     * Schedules all stops on a trip sequentially, returning detailed stop schedules with arrival and service start.
     */
    public List<ScheduledStop> schedule(
        PlanTrip trip,
        DistrictTravel travel,
        Map<String, Map<String, ServiceAllowance>> serviceByBrandDock,
        LocalTime tripDepart
    ) {
        if (trip == null || trip.stops() == null || trip.stops().isEmpty() || tripDepart == null) {
            return List.of();
        }

        int depotToDistrictMin = travel != null ? travel.depotToDistrictMinutes() : 0;
        int interStopMin = travel != null ? travel.interStopMinutes() : 0;

        List<ScheduledStop> result = new ArrayList<>(trip.stops().size());
        LocalTime currentServiceEnd = null;

        for (int i = 0; i < trip.stops().size(); i++) {
            PlanStop stop = trip.stops().get(i);
            PlanOrder order = stop.order();

            LocalTime arrival;
            if (i == 0) {
                arrival = tripDepart.plusMinutes(depotToDistrictMin);
            } else {
                arrival = currentServiceEnd.plusMinutes(interStopMin);
            }

            LocalTime windowOpen = (order != null) ? order.effectiveWindowOpen() : null;
            LocalTime windowClose = (order != null) ? order.effectiveWindowClose() : null;

            LocalTime serviceStart = arrival;
            long waitMinutes = 0;
            if (windowOpen != null && arrival.isBefore(windowOpen)) {
                serviceStart = windowOpen;
                waitMinutes = ChronoUnit.MINUTES.between(arrival, windowOpen);
            }

            boolean isLate = false;
            if (windowClose != null && arrival.isAfter(windowClose)) {
                isLate = true;
            }

            String brand = (order != null && order.brand() != null) ? order.brand() : trip.brand();
            String dockType = (order != null) ? order.dockType() : null;
            int serviceAllowanceMin = tripTimeCalculator.getServiceAllowanceMinutes(serviceByBrandDock, brand, dockType);

            currentServiceEnd = serviceStart.plusMinutes(serviceAllowanceMin);

            PlanStop updatedStop = new PlanStop(
                stop.id(),
                stop.orderId(),
                stop.stopIndex(),
                stop.order(),
                arrival,
                serviceStart
            );

            result.add(new ScheduledStop(
                updatedStop,
                arrival,
                serviceStart,
                currentServiceEnd,
                isLate,
                waitMinutes
            ));
        }

        return result;
    }

    /**
     * Resolves standard trip departure time based on brand and constraint parameters.
     */
    public LocalTime resolveTripDepartureTime(String brand, int tripIndex, PlanConstraintParams params) {
        if (params == null) {
            return "Fresh".equalsIgnoreCase(brand) ? LocalTime.of(3, 30) : LocalTime.of(8, 0);
        }
        if ("Fresh".equalsIgnoreCase(brand)) {
            return params.freshBudgetStart() != null ? params.freshBudgetStart() : LocalTime.of(3, 30);
        } else {
            return params.otherBudgetStart() != null ? params.otherBudgetStart() : LocalTime.of(8, 0);
        }
    }
}
