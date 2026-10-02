package lk.techtrithalon.waypoint.ordering.domain;

/** Persisted order statuses. Writes go only through {@link OrderStateMachine}. */
public enum OrderStatus {
    draft,
    confirmed,
    planned,
    loaded,
    in_transit,
    delivered,
    deferred,
    cancelled,
    failed,
    partial,
    receipt_confirmed;

    public String value() { return name(); }

    public static OrderStatus parse(String raw) {
        try {
            return OrderStatus.valueOf(raw);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Unknown order status: " + raw);
        }
    }
}
