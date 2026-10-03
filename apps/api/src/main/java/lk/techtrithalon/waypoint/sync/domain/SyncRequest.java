package lk.techtrithalon.waypoint.sync.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

@Schema(name="SyncRequest")
public record SyncRequest(@NotNull @Size(min=1, max=100) List<@Valid @NotNull SyncAction> actions) {}
