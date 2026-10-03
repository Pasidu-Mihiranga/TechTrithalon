package lk.techtrithalon.waypoint.delivery.application;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.planning.application.TripExecutionGuard;
import org.springframework.stereotype.Service;

/** Tells publication which trips a driver has started, with the orders they carry. */
@Service
class DepartedTripGuard implements TripExecutionGuard {
    private final DeliveryRepository deliveries;
    private final LoadTaskService loadTasks;

    DepartedTripGuard(DeliveryRepository deliveries, LoadTaskService loadTasks) {
        this.deliveries = deliveries; this.loadTasks = loadTasks;
    }

    @Override
    public List<DepartedTrip> departedTrips(CurrentUser user, LocalDate date, String depot) {
        var started = deliveries.tripsForRun(date, depot);
        if (started.isEmpty()) return List.of();
        var tasks = loadTasks.currentForRun(user, date, depot);
        List<DepartedTrip> result = new ArrayList<>();
        for (var trip : started) {
            Set<Long> orders = new HashSet<>();
            tasks.stream().filter(t -> t.vehicleId().equals(trip.vehicleId()) && t.tripIndex() == trip.tripIndex())
                .forEach(t -> t.lines().forEach(l -> orders.add(l.orderId())));
            result.add(new DepartedTrip(trip.vehicleId(), trip.tripIndex(), orders));
        }
        return result;
    }
}
