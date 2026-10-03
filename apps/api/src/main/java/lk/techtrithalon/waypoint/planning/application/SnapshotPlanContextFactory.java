package lk.techtrithalon.waypoint.planning.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalTime;
import java.util.*;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.domain.*;
import lk.techtrithalon.waypoint.reference.domain.*;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Adapts frozen server inputs to the independent validator; never accepts client metrics. */
@Component
public class SnapshotPlanContextFactory {
    private final ObjectMapper mapper;
    private final TripTimeCalculator time = new TripTimeCalculator();
    private final DistanceFuelCalculator distance = new DistanceFuelCalculator();
    private final ArrivalCalculator arrivals = new ArrivalCalculator();
    public SnapshotPlanContextFactory(ObjectMapper mapper) { this.mapper=mapper; }

    public PlanContext create(PlanningSnapshot snapshot, List<ManualPlan.TripAssignment> assignments) {
        if (snapshot.inputs()==null) throw invalid("This snapshot does not contain complete planning inputs");
        var inputs=mapper.valueToTree(snapshot.inputs());
        var reference=inputs.path("reference");
        List<CustomerOrder> sourceOrders=mapper.convertValue(inputs.path("orders"),new TypeReference<>() {});
        List<Outlet> outlets=mapper.convertValue(reference.path("outlets"),new TypeReference<>() {});
        Map<String,Outlet> outletMap=new HashMap<>();
        outlets.forEach(o -> outletMap.put(o.outletId(),o));
        List<PlanOrder> orders=sourceOrders.stream().map(o -> {
            Outlet outlet=outletMap.get(o.outletId());
            if (outlet==null) throw invalid("An order has no frozen outlet restrictions");
            return new PlanOrder(o.id(),o.ref(),o.outletId(),o.brand(),o.tempRequirement(),o.volumeM3(),o.weightKg(),
                o.district(),o.depot(),outlet.dockType(),outlet.parkingConstraint(),outlet.effectiveWindowOpen(),outlet.effectiveWindowClose());
        }).toList();
        Map<Long,PlanOrder> orderMap=new HashMap<>(); orders.forEach(o -> orderMap.put(o.id(),o));
        List<PlanVehicle> vehicles=new ArrayList<>();
        Map<String,BigDecimal> committed=new HashMap<>();
        for (var row : inputs.path("fleet")) {
            String id=row.path("vehicleId").asText();
            BigDecimal quota=row.path("weeklyFuelQuotaL").decimalValue();
            vehicles.add(new PlanVehicle(id,row.path("type").asText(),row.path("temp").asText(),
                row.path("weightCapKg").decimalValue(),row.path("volumeCapM3").decimalValue(),row.path("depot").asText(),
                row.path("kmPerL").decimalValue(),quota,row.path("availabilityStatus").isNull()?null:row.path("availabilityStatus").asText()));
            committed.put(id,row.path("fuelRemainingL").isNumber()?quota.subtract(row.path("fuelRemainingL").decimalValue()):BigDecimal.ZERO);
        }
        Map<String,PlanVehicle> vehicleMap=new HashMap<>(); vehicles.forEach(v -> vehicleMap.put(v.vehicleId(),v));
        List<DistrictTravel> travelRows=mapper.convertValue(reference.path("districtTravel"),new TypeReference<>() {});
        Map<String,DistrictTravel> travel=new HashMap<>(); travelRows.forEach(t -> travel.put(t.district(),t));
        List<ServiceAllowance> allowances=mapper.convertValue(reference.path("serviceAllowances"),new TypeReference<>() {});
        Map<String,Map<String,ServiceAllowance>> service=new HashMap<>();
        allowances.forEach(a -> service.computeIfAbsent(a.brand(),k -> new HashMap<>()).put(a.dockType(),a));
        CalendarDay calendar=mapper.convertValue(reference.path("calendar"),CalendarDay.class);
        var constraints=inputs.path("constraints");
        LocalTime freshStart=LocalTime.parse(constraints.path("freshBudgetStart").asText());
        LocalTime freshEnd=LocalTime.parse(constraints.path("freshBudgetEnd").asText());
        LocalTime otherStart=LocalTime.parse(constraints.path("otherBudgetStart").asText());
        LocalTime otherEnd=LocalTime.parse(constraints.path("otherBudgetEnd").asText());
        PlanConstraintParams params=new PlanConstraintParams(constraints.path("maxTripsPerVehicleDay").asInt(),
            (int)Duration.between(freshStart,freshEnd).toMinutes(),(int)Duration.between(otherStart,otherEnd).toMinutes(),
            freshStart,freshEnd,otherStart,otherEnd);
        // Build each trip's frozen-input metrics, then take stop times from the single vehicle-day schedule.
        Map<String,List<PlanTrip>> byVehicle=new java.util.TreeMap<>();
        for (var assignment : assignments) {
            PlanVehicle vehicle=vehicleMap.get(assignment.vehicleId());
            if (vehicle==null) throw invalid("The selected vehicle is not in the snapshot");
            DistrictTravel district=travel.get(assignment.district());
            if (district==null) throw invalid("The trip has no frozen travel inputs");
            List<PlanStop> stops=new ArrayList<>();
            for (long id : assignment.orderIds()) {
                PlanOrder order=orderMap.get(id);
                if (order==null) throw invalid("The selected order is not in the snapshot");
                if (!service.getOrDefault(order.brand(),Map.of()).containsKey(order.dockType()))
                    throw invalid("An order has no frozen service allowance");
                stops.add(new PlanStop(0,id,stops.size()+1,order,null,null));
            }
            PlanTrip raw=new PlanTrip(assignment.id(),assignment.vehicleId(),assignment.tripIndex(),assignment.brand(),assignment.district(),stops,null,null,null);
            var fuel=distance.compute(raw,district,vehicle);
            byVehicle.computeIfAbsent(raw.vehicleId(),k -> new ArrayList<>()).add(new PlanTrip(raw.id(),raw.vehicleId(),raw.tripIndex(),
                raw.brand(),raw.district(),stops,time.compute(raw,district,service),fuel.distanceKm(),fuel.fuelLitres()));
        }
        List<PlanTrip> trips=new ArrayList<>();
        for (var vehicleTrips : byVehicle.values()) {
            for (var day : arrivals.scheduleVehicleDay(vehicleTrips,travel::get,service,params)) {
                PlanTrip t=day.trip();
                trips.add(new PlanTrip(t.id(),t.vehicleId(),t.tripIndex(),t.brand(),t.district(),
                    day.stops().stream().map(ArrivalCalculator.ScheduledStop::stop).toList(),t.tripMinutes(),t.distanceKm(),t.fuelLitres()));
            }
        }
        return new PlanContext(snapshot.planDate(),snapshot.depot(),orders,vehicles,trips,travel,service,committed,calendar,params);
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"SNAPSHOT_INPUT_INVALID",message);
    }
}
