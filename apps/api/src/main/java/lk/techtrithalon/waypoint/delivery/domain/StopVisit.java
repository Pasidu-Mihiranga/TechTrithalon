package lk.techtrithalon.waypoint.delivery.domain;

import java.time.Instant;

/** Arrival at and departure from one outlet on a running trip. */
public record StopVisit(long id, long deliveryTripId, String outletId, Instant arrivedAt, Instant departedAt) {}
