package lk.techtrithalon.waypoint.sync.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** Results in the order the actions were applied (device order of occurrence). */
@Schema(name="SyncResponse")
public record SyncResponse(List<SyncResult> results, Instant syncedAt) {}
