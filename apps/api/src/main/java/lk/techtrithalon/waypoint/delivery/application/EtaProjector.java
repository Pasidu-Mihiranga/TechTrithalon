package lk.techtrithalon.waypoint.delivery.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryTrip;
import lk.techtrithalon.waypoint.delivery.domain.StopVisit;
import lk.techtrithalon.waypoint.planning.application.PublishedRouteService;
import lk.techtrithalon.waypoint.planning.domain.PublishedRoute;
import lk.techtrithalon.waypoint.shared.time.TimeConfiguration;
import org.springframework.stereotype.Component;

/**
 * Deterministic ETA fallback (no live location): project the remaining stops from the last thing that
 * happened, with the plan's own formula. Before the trip starts there is no projection. Shared by the
 * driver's screens and the dispatcher's live board so both show the same arrival times.
 */
@Component
class EtaProjector {
    private final PublishedRouteService routes;
    private final Clock clock;

    EtaProjector(PublishedRouteService routes, Clock clock) { this.routes = routes; this.clock = clock; }

    /** Projected arrival per order id for stops not yet visited; empty when there is nothing to project. */
    Map<Long, LocalTime> project(PublishedRoute route, Optional<DeliveryTrip> trip, List<StopVisit> visits) {
        Map<Long, LocalTime> result = new HashMap<>();
        if (trip.isEmpty() || "completed".equals(trip.get().status())) return result;
        Set<String> visited = visits.stream().map(StopVisit::outletId).collect(Collectors.toSet());
        var remaining = route.stops().stream().filter(s -> !visited.contains(s.outletId()))
            .sorted(Comparator.comparingInt(PublishedRoute.Stop::seq)).toList();
        if (remaining.isEmpty()) return result;
        var open = visits.stream().filter(v -> v.departedAt() == null).findFirst();
        var lastDeparture = visits.stream().map(StopVisit::departedAt).filter(Objects::nonNull).max(Instant::compareTo);
        LocalTime readyAt;
        boolean fromDepot = false;
        if (open.isPresent()) {
            // Still serving a stop: the vehicle is free once its service allowance has run (or now, if later).
            int service = route.stops().stream().filter(s -> s.outletId().equals(open.get().outletId()))
                .mapToInt(PublishedRoute.Stop::serviceMinutes).sum();
            LocalTime done = local(open.get().arrivedAt()).plusMinutes(service);
            LocalTime now = local(clock.instant());
            readyAt = now.isAfter(done) ? now : done;
        } else if (lastDeparture.isPresent()) {
            readyAt = local(lastDeparture.get());
        } else {
            readyAt = local(trip.get().startedAt());
            fromDepot = true;
        }
        var projected = routes.projectArrivals(route, remaining, readyAt, fromDepot);
        for (int i = 0; i < remaining.size(); i++) result.put(remaining.get(i).orderId(), projected.get(i));
        return result;
    }

    private static LocalTime local(Instant at) { return at.atZone(TimeConfiguration.BUSINESS_ZONE).toLocalTime(); }
}
