package lk.techtrithalon.waypoint.delivery.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryRecord;
import lk.techtrithalon.waypoint.delivery.domain.DeliveryTrip;
import lk.techtrithalon.waypoint.delivery.domain.PodAsset;
import lk.techtrithalon.waypoint.delivery.domain.StopVisit;

public interface DeliveryRepository {
    long insertTrip(LocalDate date, String depot, String vehicleId, int tripIndex, long driver, int planVersion, Instant at);
    Optional<DeliveryTrip> trip(LocalDate date, String vehicleId, int tripIndex, boolean forUpdate);
    Optional<DeliveryTrip> trip(long id);
    List<DeliveryTrip> tripsForRun(LocalDate date, String depot);
    /** The driver's trips before {@code before}, newest first. */
    List<DeliveryTrip> pastTrips(long driver, LocalDate before, int limit);
    /** Optimistic concurrency: bumps the version only if it still equals {@code expected}. */
    boolean bumpVersion(long tripId, int expected, Instant at);
    /** Bumps the version without a check (replayed field commands carry no version). */
    void touch(long tripId, Instant at);
    void complete(long tripId, Instant at);

    List<StopVisit> visits(long tripId);
    void arrive(long tripId, String outletId, long actor, Instant at);
    void depart(long visitId, long actor, Instant at);

    List<DeliveryRecord> records(long tripId);
    Optional<DeliveryRecord> recordForOrder(long orderId);
    long insertRecord(long tripId, long orderId, String outletId, String outcome, int ordered, int loaded, int delivered,
                      String issueKind, String recipient, String notes, long actor, Instant occurredAt, Instant recordedAt, String review);

    long insertAsset(long tripId, long orderId, String kind, String storage, String objectKey, String contentType,
                     int bytes, int width, int height, long actor, Instant at, java.util.UUID clientUploadId);
    Optional<PodAsset> assetByClientId(long uploader, java.util.UUID clientUploadId);
    Optional<PodAsset> asset(long id);
    List<PodAsset> assetsForOrder(long orderId);
    List<PodAsset> assetsForTrip(long tripId);
    /** Attaches unattached uploads of this order to its record; returns how many were attached. */
    int attachAssets(Collection<Long> assetIds, long orderId, long recordId);
}
