package lk.techtrithalon.waypoint.planning.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.domain.ManualPlan;

public interface ManualPlanRepository {
    void lockScope(LocalDate date, String depot);
    ManualPlan create(long snapshotId, LocalDate date, String depot, long actor, Instant at);
    Optional<ManualPlan> find(long id, boolean forUpdate);
    List<Long> list(LocalDate date, String depot);
    void replace(ManualPlan plan, List<ManualPlan.TripAssignment> trips,
                 List<ManualPlan.OrderDisposition> dispositions, Instant at);
    boolean hasPublished(LocalDate date, String depot);
    void publish(ManualPlan plan, long actor, Instant at);
}
