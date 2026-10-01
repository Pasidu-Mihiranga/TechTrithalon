package lk.techtrithalon.waypoint.shared.error;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import lk.techtrithalon.waypoint.shared.web.RequestIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

class ApiExceptionHandlerTest {
    @RestController
    static class FailingController {
        @GetMapping("/known") void known() { throw new ApiException(HttpStatus.CONFLICT, "STALE_PLAN", "Plan version 3 is stale"); }
        @GetMapping("/unknown") void unknown() { throw new IllegalStateException("database password is hunter2"); }
    }

    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new FailingController())
        .setControllerAdvice(new ApiExceptionHandler())
        .addFilters(new RequestIdFilter())
        .build();

    @Test
    void knownFailureUsesProblemShapeWithStableCodeAndTraceId() throws Exception {
        mvc.perform(get("/known").header(RequestIdFilter.HEADER, "test-trace-0001"))
            .andExpect(status().isConflict())
            .andExpect(header().string(RequestIdFilter.HEADER, "test-trace-0001"))
            .andExpect(jsonPath("$.status").value(409))
            .andExpect(jsonPath("$.code").value("STALE_PLAN"))
            .andExpect(jsonPath("$.detail").value("Plan version 3 is stale"))
            .andExpect(jsonPath("$.traceId").value("test-trace-0001"));
    }

    @Test
    void unexpectedFailureDoesNotLeakInternals() throws Exception {
        mvc.perform(get("/unknown"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andExpect(jsonPath("$.detail").value("An unexpected error occurred"))
            .andExpect(jsonPath("$.traceId").value(matchesPattern("[0-9a-f-]{36}")));
    }

    @Test
    void unsafeIncomingRequestIdIsReplaced() throws Exception {
        mvc.perform(get("/known").header(RequestIdFilter.HEADER, "<script>"))
            .andExpect(header().string(RequestIdFilter.HEADER, matchesPattern("[0-9a-f-]{36}")));
    }
}
