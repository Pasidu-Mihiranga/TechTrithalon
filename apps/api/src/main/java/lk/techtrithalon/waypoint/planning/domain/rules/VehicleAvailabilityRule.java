package lk.techtrithalon.waypoint.planning.domain.rules;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.PlanVehicle;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R12: Only vehicles with availability status 'available' may be assigned to delivery trips.
 */
public class VehicleAvailabilityRule implements ConstraintRule {

    public static final String CODE = "VEHICLE_AVAILABILITY";

    @Override
    public String code() {
        return CODE;
    }

    @Override
    public Severity severity() {
        return Severity.HARD;
    }

    @Override
    public Scope scope() {
        return Scope.VEHICLE_DAY;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.vehicles() == null || ctx.trips() == null) {
            return List.of();
        }

        Map<String, PlanVehicle> vehicleMap = ctx.vehicles().stream()
            .collect(Collectors.toMap(PlanVehicle::vehicleId, Function.identity(), (v1, v2) -> v1));

        Set<String> assignedVehicleIds = new HashSet<>();
        for (PlanTrip trip : ctx.trips()) {
            if (trip.vehicleId() != null && !trip.stops().isEmpty()) {
                assignedVehicleIds.add(trip.vehicleId());
            }
        }

        List<ConstraintViolation> violations = new ArrayList<>();

        for (String vehicleId : assignedVehicleIds) {
            PlanVehicle vehicle = vehicleMap.get(vehicleId);
            String status = vehicle != null ? vehicle.availabilityStatus() : "unknown";

            boolean isAvailable = "available".equalsIgnoreCase(status);
            if (!isAvailable) {
                violations.add(new ConstraintViolation(
                    CODE,
                    Severity.HARD,
                    Scope.VEHICLE_DAY,
                    EntityType.VEHICLE,
                    vehicleId,
                    "Vehicle " + vehicleId + " is assigned to trips but is unavailable (status: "
                        + status + ").",
                    status != null ? status : "N/A",
                    "available",
                    "VEHICLE_UNAVAILABLE",
                    Map.of(
                        "vehicleId", vehicleId,
                        "availabilityStatus", status != null ? status : "N/A"
                    )
                ));
            }
        }

        return violations;
    }
}
