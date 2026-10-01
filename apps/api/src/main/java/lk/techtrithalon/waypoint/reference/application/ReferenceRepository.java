package lk.techtrithalon.waypoint.reference.application;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.reference.domain.*;
public interface ReferenceRepository {
    List<Outlet> outlets(String outletId, String depot, String brand, String district);
    Optional<Vehicle> vehicle(String id);
    List<Vehicle> vehicles(String depot);
    List<DistrictTravel> districts(String depot, String outletId);
    List<ServiceAllowance> allowances(String brand);
    List<CalendarDay> calendar(LocalDate from, LocalDate to);
}
