package lk.techtrithalon.waypoint.shared.error;

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
}
