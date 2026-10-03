package lk.techtrithalon.waypoint.receipt.application;

import java.util.Map;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

/** A receipt action the order's current state does not allow, with the facts the screen needs. */
public class ReceiptConflictException extends ApiException {
    private final Map<String, Object> properties;

    public ReceiptConflictException(String code, String message, Map<String, Object> properties) {
        super(HttpStatus.CONFLICT, code, message);
        this.properties = Map.copyOf(properties);
    }

    @Override public Map<String, Object> properties() { return properties; }
}
