package lk.techtrithalon.waypoint.planning.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.domain.PlanningSnapshot;

public interface PlanningSnapshotRepository {
    PlanningSnapshot insert(
        LocalDate planDate,
        String depot,
        Instant takenAt,
        List<Long> orderIds,
        String fleetJson,
        String constraintsJson,
        String referenceVersion,
        String contentHash,
        long takenBy,
        String inputsJson,
        String selectionMode
    );

    Optional<PlanningSnapshot> findById(long id);

    Optional<PlanningSnapshot> findLatest(LocalDate planDate, String depot);
}
