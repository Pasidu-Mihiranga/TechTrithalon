package lk.techtrithalon.waypoint.fleetops.application;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.Optional;
import lk.techtrithalon.waypoint.fleetops.domain.*;
public interface FleetRepository {
    Optional<VehicleAvailability> availability(String vehicleId,LocalDate date);
    Optional<VehicleAvailability> update(String vehicleId,LocalDate date,String status,String note,long expectedVersion,long actorId,Instant at);
    Optional<FuelBalance> fuel(String vehicleId,int year,int week,BigDecimal quota);
}
