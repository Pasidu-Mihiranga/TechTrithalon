package lk.techtrithalon.waypoint.system;

/** @param intelligence {@code reachable} or {@code unavailable}; the API stays up either way. */
public record SystemHealth(String service, String status, String intelligence) {}
