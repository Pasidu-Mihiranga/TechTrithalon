package lk.techtrithalon.waypoint.planning.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.domain.ManualPlan;
import lk.techtrithalon.waypoint.planning.domain.PublishedTrip;

public interface ManualPlanRepository {
    void lockScope(LocalDate date, String depot);
    ManualPlan create(long snapshotId, LocalDate date, String depot, long actor, Instant at, Long basedOnPlanId);
    Optional<ManualPlan> find(long id, boolean forUpdate);
    List<Long> list(LocalDate date, String depot);
    void replace(ManualPlan plan, List<ManualPlan.TripAssignment> trips,
                 List<ManualPlan.OrderDisposition> dispositions, Instant at);
    /** The current published plan for a run; call {@link #lockScope} first when deciding on it. */
    Optional<Long> currentPublished(LocalDate date, String depot);
    void supersede(long planId, long byPlanId, Instant at);
    void publish(ManualPlan plan, long actor, Instant at, String ruleVersion);
    void freezeTrip(long tripId, LocalTime plannedDepart, int tripMinutes, BigDecimal distanceKm, BigDecimal fuelLitres,
                    Long driverUserId, String driverName);
    void freezeStop(long tripId, long orderId, LocalTime plannedArrival, LocalTime serviceStart);
    /** Fuel each vehicle's trips reserved when the plan was published. */
    Map<String, BigDecimal> publishedFuelByVehicle(long planId);
    List<PublishedTrip> publishedTrips(long planId);
}
