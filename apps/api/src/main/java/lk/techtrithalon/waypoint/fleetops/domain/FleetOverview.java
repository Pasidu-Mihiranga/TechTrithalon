package lk.techtrithalon.waypoint.fleetops.domain;

import java.time.LocalDate;
import java.util.List;

/** Depot fleet and operational state for one delivery day. */
public record FleetOverview(LocalDate date, String depot, int totalVehicles, int onRouteVehicles,
                            int idleVehicles, int inWorkshopVehicles, int unrecordedVehicles,
                            List<VehicleRow> vehicles) {
    public record VehicleRow(FleetVehicle vehicle, String state, String driverName,
                             Integer tripIndex, int stopsDone, int stops) {}
}
