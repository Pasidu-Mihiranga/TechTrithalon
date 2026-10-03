package lk.techtrithalon.waypoint.fleetops.application;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.delivery.application.LiveBoardService;
import lk.techtrithalon.waypoint.delivery.domain.LiveViews;
import lk.techtrithalon.waypoint.fleetops.domain.FleetOverview;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.stereotype.Service;

/** Combines fleet availability with the published operational board without copying either store. */
@Service
public class FleetOverviewService {
    private final FleetService fleet;
    private final LiveBoardService liveBoard;

    public FleetOverviewService(FleetService fleet, LiveBoardService liveBoard) {
        this.fleet = fleet;
        this.liveBoard = liveBoard;
    }

    public FleetOverview overview(CurrentUser user, LocalDate date, String depot) {
        var vehicles = fleet.fleet(user, date, depot);
        var live = liveBoard.board(user, date, depot);
        Map<String, LiveViews.Vehicle> currentTrip = live.vehicles().stream()
            .sorted(Comparator.comparingInt((LiveViews.Vehicle trip) -> statePriority(trip.state())).reversed())
            .collect(Collectors.toMap(LiveViews.Vehicle::vehicleId, Function.identity(), (first, ignored) -> first));
        var rows = vehicles.stream().map(vehicle -> {
            var trip = currentTrip.get(vehicle.vehicleId());
            boolean onRoute = trip != null && ("IN_TRANSIT".equals(trip.state()) || "DELAYED".equals(trip.state()));
            String state = onRoute ? "on_route" : "in_workshop".equals(vehicle.availabilityStatus()) ? "in_workshop"
                : "available".equals(vehicle.availabilityStatus()) ? "idle" : "not_recorded";
            return new FleetOverview.VehicleRow(vehicle, state, trip == null ? null : trip.driverName(),
                trip == null ? null : trip.tripIndex(), trip == null ? 0 : trip.stopsDone(), trip == null ? 0 : trip.stops());
        }).toList();
        return new FleetOverview(date, depot, rows.size(),
            (int) rows.stream().filter(row -> "on_route".equals(row.state())).count(),
            (int) rows.stream().filter(row -> "idle".equals(row.state())).count(),
            (int) rows.stream().filter(row -> "in_workshop".equals(row.state())).count(),
            (int) rows.stream().filter(row -> "not_recorded".equals(row.state())).count(), rows);
    }

    private static int statePriority(String state) {
        return switch (state) { case "DELAYED", "IN_TRANSIT" -> 3; case "READY" -> 2; case "LOADING" -> 1; default -> 0; };
    }
}
