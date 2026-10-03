package lk.techtrithalon.waypoint.fleetops.application;
import java.time.Clock;
import java.time.LocalDate;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.fleetops.domain.*;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class FleetService {
    private final ReferenceService reference;
    private final FleetRepository repository;
    private final AuditService audit;
    private final Clock clock;
    public FleetService(ReferenceService reference,FleetRepository repository,AuditService audit,Clock clock) {
        this.reference=reference; this.repository=repository; this.audit=audit; this.clock=clock;
    }
    public VehicleAvailability availability(CurrentUser user,String vehicleId,LocalDate date) {
        reference.vehicle(user,vehicleId); reference.day(date);
        return repository.availability(vehicleId,date).orElse(new VehicleAvailability(vehicleId,date,null,null,0,null,null,false));
    }
    @Transactional
    public VehicleAvailability update(CurrentUser user,String vehicleId,LocalDate date,String status,String note,long expectedVersion) {
        reference.vehicle(user,vehicleId);
        repository.lockAvailability(vehicleId,date);
        VehicleAvailability before=availability(user,vehicleId,date);
        if (!reference.day(date).operating()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"NON_OPERATING_DAY","Availability changes require an operating date");
        if (!"available".equals(status) && !"in_workshop".equals(status)) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_STATUS","Use available or in_workshop");
        VehicleAvailability after=repository.update(vehicleId,date,status,note,expectedVersion,user.id(),clock.instant())
            .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,"STALE_AVAILABILITY","Availability changed; reload before saving"));
        audit.record("vehicle.availability.changed",user,"vehicle",vehicleId,before,after,note);
        return after;
    }
    public FuelBalance fuel(CurrentUser user,String vehicleId,LocalDate date) {
        var vehicle=reference.vehicle(user,vehicleId);
        var day=reference.day(date);
        return repository.fuel(vehicleId,day.isoYear(),day.isoWeek(),vehicle.weeklyFuelQuotaL())
            .orElse(new FuelBalance(vehicleId,day.isoYear(),day.isoWeek(),vehicle.weeklyFuelQuotaL(),null,null,null,false));
    }
    /** Published planning boundary: serialize reservations without exposing this module's repository. */
    @Transactional
    public void lockPlanningFuel(CurrentUser user,java.util.List<String> ids,LocalDate date) {
        var day=reference.day(date);
        for (String id : ids.stream().distinct().sorted().toList()) {
            reference.vehicle(user,id);
            repository.lockAvailability(id,date);
            repository.lockPlanningFuel(id,day.isoYear(),day.isoWeek());
        }
    }
    @Transactional
    public void commitPlanningFuel(CurrentUser user,java.util.Map<String,java.math.BigDecimal> amounts,LocalDate date) {
        var day=reference.day(date);
        for (var entry : new java.util.TreeMap<>(amounts).entrySet()) {
            var vehicle=reference.vehicle(user,entry.getKey());
            var before=fuel(user,entry.getKey(),date);
            if (!repository.commitPlanningFuel(entry.getKey(),day.isoYear(),day.isoWeek(),entry.getValue(),vehicle.weeklyFuelQuotaL()))
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"FUEL_QUOTA","Fuel changed; the plan exceeds the weekly quota");
            audit.record("vehicle.fuel.reserved",user,"vehicle",entry.getKey(),before,fuel(user,entry.getKey(),date),"Validated plan publication");
        }
    }
    public java.util.List<FleetVehicle> fleet(CurrentUser user, LocalDate date) {
        return fleet(user, date, null);
    }
    public java.util.List<FleetVehicle> fleet(CurrentUser user, LocalDate date, String requestedDepot) {
        reference.day(date);
        String depot = requestedDepot == null || requestedDepot.isBlank() ? user.depot() : requestedDepot;
        if (depot != null && (!user.canAccessDepot(depot) || !reference.depots(user).contains(depot))) {
            throw new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Resource not found");
        }
        return repository.fleet(depot, date);
    }
    public FleetVehicle fleetVehicle(CurrentUser user, String vehicleId, LocalDate date) {
        reference.day(date);
        return repository.fleetVehicle(vehicleId, date)
            .filter(v -> user.canAccessDepot(v.depot()))
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Resource not found"));
    }
}
