package lk.techtrithalon.waypoint.delivery.domain;

import java.time.Instant;

/** A stored proof photo or signature; the bytes live in object storage under {@code objectKey}. */
public record PodAsset(long id, long deliveryTripId, long orderId, Long deliveryRecordId, String kind, String storage,
                       String objectKey, String contentType, int bytes, int width, int height, long uploadedBy, Instant uploadedAt) {}
