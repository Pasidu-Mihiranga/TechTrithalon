package lk.techtrithalon.waypoint.reference.application;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.reference.domain.*;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
@Service
public class ReferenceService {
    private final ReferenceRepository repository;
    public ReferenceService(ReferenceRepository repository) { this.repository = repository; }
    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","Resource not found"); }
    private String outletScope(CurrentUser user) { return user.role()==Role.STORE_MANAGER ? user.outletId() : null; }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public List<Outlet> outlets(CurrentUser user, String brand, String district) {
        return repository.outlets(outletScope(user), user.role()==Role.DISPATCHER ? user.depot() : null, brand, district);
    }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public Outlet outlet(CurrentUser user,String id) {
        return outlets(user,null,null).stream().filter(o -> o.outletId().equals(id)).findFirst().orElseThrow(ReferenceService::missing);
    }
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<Vehicle> vehicles(CurrentUser user) { return repository.vehicles(user.depot()); }
    @PreAuthorize("hasRole('DISPATCHER')")
    public Vehicle vehicle(CurrentUser user,String id) {
        return repository.vehicle(id).filter(v -> user.canAccessDepot(v.depot())).orElseThrow(ReferenceService::missing);
    }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public List<DistrictTravel> districts(CurrentUser user) { return repository.districts(user.role()==Role.DISPATCHER ? user.depot() : null,outletScope(user)); }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public List<String> depots(CurrentUser user) { return districts(user).stream().map(DistrictTravel::depot).distinct().sorted().toList(); }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public List<ServiceAllowance> allowances(CurrentUser user) {
        String brand=user.role()==Role.STORE_MANAGER ? outlet(user,user.outletId()).brand() : null;
        return repository.allowances(brand);
    }
    @PreAuthorize("hasAnyRole('DISPATCHER','STORE_MANAGER')")
    public List<CalendarDay> calendar(LocalDate from,LocalDate to) {
        if (from.isAfter(to) || ChronoUnit.DAYS.between(from,to)>366) throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_DATE_RANGE","Choose an ordered date range of at most 367 days");
        return repository.calendar(from,to);
    }
    @PreAuthorize("hasRole('DISPATCHER')")
    public CalendarDay day(LocalDate date) { return repository.calendar(date,date).stream().findFirst().orElseThrow(ReferenceService::missing); }
}
