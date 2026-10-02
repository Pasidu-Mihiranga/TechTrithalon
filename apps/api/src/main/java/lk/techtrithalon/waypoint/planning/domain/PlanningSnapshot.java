package lk.techtrithalon.waypoint.planning.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Immutable freeze of planning inputs for one date+depot attempt. */
public record PlanningSnapshot(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) long id,
    LocalDate planDate,
    String depot,
    Instant takenAt,
    List<Long> orderIds,
    List<Map<String, Object>> fleet,
    Map<String, Object> constraints,
    String referenceVersion,
    String contentHash,
    Long takenBy
) {}
