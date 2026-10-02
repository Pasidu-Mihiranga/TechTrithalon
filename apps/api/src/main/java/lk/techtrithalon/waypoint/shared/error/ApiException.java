package lk.techtrithalon.waypoint.shared.error;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** A failure the client is expected to handle, identified by a stable machine-readable code. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }

    /** Extra response headers (for example Retry-After). Empty by default. */
    public Map<String, String> headers() { return Map.of(); }
}
