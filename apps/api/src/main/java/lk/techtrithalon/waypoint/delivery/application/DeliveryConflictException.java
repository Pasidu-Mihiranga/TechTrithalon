package lk.techtrithalon.waypoint.delivery.application;

import java.util.Map;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

/** A driver action the trip's current state does not allow, with the facts the screen needs to recover. */
public class DeliveryConflictException extends ApiException {
    private final Map<String, Object> properties;

    public DeliveryConflictException(String code, String message, Map<String, Object> properties) {
        super(HttpStatus.CONFLICT, code, message);
        this.properties = Map.copyOf(properties);
    }

    @Override public Map<String, Object> properties() { return properties; }
}
