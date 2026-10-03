package lk.techtrithalon.waypoint.fleetops.application;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.fleetops.domain.*;
public interface FleetRepository {
    void lockPlanningFuel(String vehicleId, int year, int week);
    void lockAvailability(String vehicleId, java.time.LocalDate date);
    boolean commitPlanningFuel(String vehicleId, int year, int week, java.math.BigDecimal amount, java.math.BigDecimal quota);
    /** Returns a superseded plan's reservation; false when the ledger holds less than the amount. */
    boolean releasePlanningFuel(String vehicleId, int year, int week, java.math.BigDecimal amount);
    Optional<VehicleAvailability> availability(String vehicleId,LocalDate date);
    Optional<VehicleAvailability> update(String vehicleId,LocalDate date,String status,String note,long expectedVersion,long actorId,Instant at);
    Optional<FuelBalance> fuel(String vehicleId,int year,int week,BigDecimal quota);
    List<FleetVehicle> fleet(String depot, LocalDate date);
    Optional<FleetVehicle> fleetVehicle(String vehicleId, LocalDate date);
}
