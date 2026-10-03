package lk.techtrithalon.waypoint.planning.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;

/**
 * Trips already on the road, as reported by the module that runs them. Publication refuses a revision
 * that would move or remove orders that have physically left the depot; resequencing the stops still
 * to serve is allowed.
 */
public interface TripExecutionGuard {
    record DepartedTrip(String vehicleId, int tripIndex, Set<Long> orderIds) {
        public DepartedTrip { orderIds = Set.copyOf(orderIds); }
    }

    List<DepartedTrip> departedTrips(CurrentUser user, LocalDate date, String depot);
}
