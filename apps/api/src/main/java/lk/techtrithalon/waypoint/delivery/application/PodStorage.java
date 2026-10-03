package lk.techtrithalon.waypoint.delivery.application;

/**
 * Object storage for proof-of-delivery files. Only the returned key is stored in PostgreSQL.
 * Implementations never keep the bytes in the database.
 */
public interface PodStorage {
    /** Short provider name stored with each asset (for example "cloudinary"). */
    String name();
    /** False when the deployment has no storage credentials; uploads are then refused honestly. */
    boolean configured();
    /** Stores the already validated and re-encoded image; returns its object key. */
    String store(String objectKey, byte[] bytes, String contentType);
    /** A short-lived link a browser can display. */
    String viewUrl(String objectKey);
}
