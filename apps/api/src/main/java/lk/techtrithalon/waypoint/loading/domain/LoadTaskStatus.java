package lk.techtrithalon.waypoint.loading.domain;

/** Load status of a published trip, for the plan views that show which manifest the dock holds. */
public record LoadTaskStatus(long loadTaskId, long tripId, int planVersion, String status, int openIssues, boolean held) {}
