package lk.techtrithalon.waypoint.shared.error;

import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.shared.web.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * The one error shape for the whole API: RFC 7807 problem details extended with a stable
 * {@code code}, the request's {@code traceId}, and {@code violations} for field-level failures.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ProblemDetail handleApi(ApiException ex) {
        return problem(ex.status(), ex.code(), ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed");
        List<Map<String, String>> violations = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> Map.of("field", e.getField(), "message", String.valueOf(e.getDefaultMessage())))
            .toList();
        problem.setProperty("violations", violations);
        return problem;
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        // Never leak internals to the client; the traceId links the response to the log line.
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        problem.setProperty("traceId", MDC.get(RequestIdFilter.MDC_KEY));
        return problem;
    }
}
