package lk.techtrithalon.waypoint.planning.domain;

import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
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
 * <p><strong>COMPETITION RULE</strong> (booklet p.15): a vehicle that arrives early waits until the
 * window opens; lateness means arrival after the window closes.
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

    /** One trip of a vehicle day: when it departs, its stop schedule, and when the vehicle is free again. */
    public record TripSchedule(PlanTrip trip, LocalTime departure, List<ScheduledStop> stops, LocalTime availableAfter) {}

    /**
     * The single schedule for one vehicle's day, shared by plan construction and the R8 rule.
     *
     * <p>Trips run in slot order. A later trip departs at its nominal start, or when the previous
     * trip's last service ends if that is later ({@code departure + tripMinutes + waiting}).
     * COMPETITION RULE: a vehicle "can return to the depot and reload once" (two trips), and trip time
     * excludes the return journey because "the stated budgets already allow for it". The booklet
     * gives no time for the return leg or the reload.
     * WAYPOINT IMPLEMENTATION ASSUMPTION: no return or reload time is added between trips. This is an
     * open question, not a rule; see TECHNICAL_REFERENCE section 17, "Open timing questions".
     */
    public List<TripSchedule> scheduleVehicleDay(
        List<PlanTrip> vehicleTrips,
        Function<String, DistrictTravel> travelFor,
        Map<String, Map<String, ServiceAllowance>> serviceByBrandDock,
        PlanConstraintParams params
    ) {
        if (vehicleTrips == null || vehicleTrips.isEmpty()) {
            return List.of();
        }
        List<PlanTrip> ordered = new ArrayList<>(vehicleTrips);
        ordered.sort(Comparator.comparingInt(PlanTrip::tripIndex));

        List<TripSchedule> result = new ArrayList<>(ordered.size());
        LocalTime nextAvailable = null;
        for (PlanTrip trip : ordered) {
            DistrictTravel travel = travelFor.apply(trip.district());
            LocalTime departure = resolveTripDepartureTime(trip.brand(), trip.tripIndex(), params);
            if (nextAvailable != null && nextAvailable.isAfter(departure)) {
                departure = nextAvailable;
            }
            List<ScheduledStop> stops = schedule(trip, travel, serviceByBrandDock, departure);
            int tripMinutes = (trip.tripMinutes() != null && trip.tripMinutes() > 0)
                ? trip.tripMinutes()
                : tripTimeCalculator.compute(trip, travel, serviceByBrandDock);
            // Waiting is elapsed schedule time, separate from the prescribed trip-time budget.
            long waitMinutes = stops.stream().mapToLong(ScheduledStop::waitMinutes).sum();
            nextAvailable = departure.plusMinutes(tripMinutes + waitMinutes);
            result.add(new TripSchedule(trip, departure, stops, nextAvailable));
        }
        return result;
    }

    /**
     * Resolves the nominal trip departure time from the budget window start.
     *
     * <p>WAYPOINT IMPLEMENTATION ASSUMPTION: the booklet gives the Fresh budget window
     * (3:30 AM to 8 AM) and the Style/Tech "trading day" budget, not a departure time. Waypoint
     * departs Fresh trips at the Fresh window start and Style/Tech trips at the configured
     * other-budget start (08:00).
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
