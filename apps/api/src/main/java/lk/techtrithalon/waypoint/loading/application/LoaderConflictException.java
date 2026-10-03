package lk.techtrithalon.waypoint.loading.application;

import java.util.Map;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;

/** A loading action the current state does not allow, with the facts the screen needs to recover. */
public class LoaderConflictException extends ApiException {
    private final Map<String, Object> properties;

    public LoaderConflictException(String code, String message, Map<String, Object> properties) {
        super(HttpStatus.CONFLICT, code, message);
        this.properties = Map.copyOf(properties);
    }

    @Override public Map<String, Object> properties() { return properties; }
}
