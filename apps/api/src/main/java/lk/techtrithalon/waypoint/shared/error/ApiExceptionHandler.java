package lk.techtrithalon.waypoint.shared.error;

import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.shared.web.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * The one error shape for the whole API: RFC 7807 problem details extended with a stable
 * {@code code}, the request's {@code traceId}, and {@code violations} for field-level failures.
 *
 * <p>Extends Spring's {@link ResponseEntityExceptionHandler} so that framework errors (404, 405,
 * malformed JSON, ...) get the same {@code code} and {@code traceId} as our own.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ProblemDetail handleApi(ApiException ex) {
        return problem(ex.status(), ex.code(), ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        // Never leak internals to the client; the traceId links the response to the log line.
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed");
        List<Map<String, String>> violations = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> Map.of("field", e.getField(), "message", String.valueOf(e.getDefaultMessage())))
            .toList();
        problem.setProperty("violations", violations);
        return ResponseEntity.badRequest().headers(headers).body(problem);
    }

    /** Every framework-generated error passes through here; stamp it with a code and the trace id. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        // Spring passes a null body and builds the ProblemDetail inside super, so stamp the result.
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            if (problem.getProperties() == null || !problem.getProperties().containsKey("code")) {
                problem.setProperty("code", statusCode instanceof HttpStatus s ? s.name() : "HTTP_" + statusCode.value());
            }
            problem.setProperty("traceId", MDC.get(RequestIdFilter.MDC_KEY));
        }
        return response;
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty("code", code);
        problem.setProperty("traceId", MDC.get(RequestIdFilter.MDC_KEY));
        return problem;
    }
}
