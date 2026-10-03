package lk.techtrithalon.waypoint.loading.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.loading.domain.LoadTask;
import lk.techtrithalon.waypoint.loading.domain.LoadingIssue;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;

public interface LoadTaskRepository {
    /** Inserts the task and its lines with the given loading order; returns the task id. */
    long insert(NewLoadTask task, List<Integer> loadSequence, Long replacesTaskId, boolean acknowledgementRequired, Instant at);
    /** Marks every active task of a plan superseded; returns how many changed. */
    int supersedeForPlan(long planId, Instant at);
    Optional<LoadTask> find(long id, boolean forUpdate);
    List<LoadTask> forPlan(long planId);
    /** Active (not superseded) tasks for a run, ordered by planned departure. */
    List<LoadTask> activeForRun(LocalDate date, String depot);
    /** The task for the same vehicle and trip slot in a given plan, if any. */
    Optional<LoadTask> forSlot(long planId, String vehicleId, int tripIndex);
    /** The task that replaced this one, if it was superseded. */
    Optional<Long> replacedBy(long taskId);
    /** Copies a counted line of the replaced manifest onto the new line and moves its open issue along. */
    void carryLine(long newLineId, long newTaskId, long oldLineId, int planVersion);
    /** Active tasks published to a driver for a run, ordered by planned departure. */
    List<LoadTask> activeForDriver(LocalDate date, long driverUserId);
    /** A republished task for a handed-over trip with the same orders keeps the handover. */
    void inheritLoaded(long taskId, long replacedTaskId);
    void markStarted(long taskId, long actor, Instant at);
    /** A republished task whose counts carried over keeps the original loading start. */
    void inheritStart(long taskId, long replacedTaskId);
    void recordLine(long lineId, String status, int loadedUnits, long actor, Instant at);
    void acknowledge(long taskId, long actor, Instant at);
    void markLoaded(long taskId, long actor, Instant at);
    /** Optimistic concurrency: bumps the version only if it still equals {@code expected}. */
    boolean bumpVersion(long taskId, int expected, Instant at);

    long insertIssue(LoadTask task, long lineId, long orderId, String orderRef, String outletId, String kind,
                     int orderedUnits, int shortUnits, String note, boolean holdsVehicle, long actor, String actorName, Instant at);
    Optional<LoadingIssue> findIssue(long id, boolean forUpdate);
    List<LoadingIssue> issuesForTask(long taskId);
    List<LoadingIssue> issuesForRun(LocalDate date, String depot, String status);
    boolean resolveIssue(long id, int expectedVersion, String decision, String note, long actor, String actorName, Instant at);
}
