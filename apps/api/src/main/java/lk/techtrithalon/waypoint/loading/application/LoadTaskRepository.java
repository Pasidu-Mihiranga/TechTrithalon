package lk.techtrithalon.waypoint.loading.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadTaskStatus;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;

public interface LoadTaskRepository {
    /** Inserts the task and its lines; {@code loadSeq} must already be set by the caller. */
    long insert(NewLoadTask task, List<Integer> loadSequence, Instant at);
    /** Marks every active task of a plan superseded; returns how many changed. */
    int supersedeForPlan(long planId, Instant at);
    List<LoadTaskStatus> statusForPlan(long planId);
    Optional<LoadTask> find(long id);
    List<LoadTask> forPlan(long planId);
}
