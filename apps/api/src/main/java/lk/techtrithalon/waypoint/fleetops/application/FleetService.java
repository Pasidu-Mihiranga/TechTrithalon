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
}
