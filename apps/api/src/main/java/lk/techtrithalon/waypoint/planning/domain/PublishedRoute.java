package lk.techtrithalon.waypoint.planning.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/**
 * A trip of the current published plan as the road sees it: the frozen schedule plus the stop facts a
 * driver needs (window, dock, parking) and the travel inputs used to project arrivals. Read-only.
 */
public record PublishedRoute(long planId, int planVersion, long tripId, LocalDate planDate, String depot,
                             String vehicleId, int tripIndex, String brand, String district,
                             LocalTime plannedDepart, int tripMinutes, BigDecimal distanceKm,
                             Long driverUserId, String driverName,
                             int depotToDistrictMinutes, int interStopMinutes, List<Stop> stops) {
    public PublishedRoute { stops = List.copyOf(stops); }

    public record Stop(long orderId, int seq, String outletId, String dockType, String parkingConstraint,
                       LocalTime windowOpen, LocalTime windowClose, LocalTime plannedArrival, LocalTime serviceStart,
                       int serviceMinutes) {}
}
