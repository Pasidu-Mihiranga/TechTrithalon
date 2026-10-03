package lk.techtrithalon.waypoint.delivery.domain;

import java.time.Instant;

/** The recorded outcome of one order. Units are per order (no product catalog exists). */
public record DeliveryRecord(long id, long deliveryTripId, long orderId, String outletId, String outcome,
                             int orderedUnits, int loadedUnits, int deliveredUnits, String issueKind,
                             String recipientName, String notes, long recordedBy, Instant occurredAt, Instant recordedAt) {}
