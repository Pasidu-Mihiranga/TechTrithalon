package lk.techtrithalon.waypoint.exceptions.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

final class ExceptionRequests {
    private ExceptionRequests() {}

    @Schema(name="ExceptionResolveRequest")
    record Resolve(@Min(0) int expectedVersion,
                   @Schema(nullable=true, description="Required for loading shortfalls and store disputes") @Size(max=40) String decision,
                   @Schema(description="What was decided and why") @Size(max=1000) String note) {}
}
