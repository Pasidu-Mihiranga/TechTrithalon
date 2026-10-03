package lk.techtrithalon.waypoint.delivery.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lk.techtrithalon.waypoint.delivery.application.PodStorage;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Proof files in Cloudinary (owner decision 2026-10-03), through its REST upload API, so no SDK is
 * needed. Files are uploaded as {@code authenticated}: they are not public, and the API hands out
 * signed delivery links. Configure with {@code CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud>};
 * without it, uploads are refused with 503 and the rest of the driver workflow still works.
 */
@Component
class CloudinaryPodStorage implements PodStorage {
    private static final Logger log = LoggerFactory.getLogger(CloudinaryPodStorage.class);
    private final String cloud;
    private final String apiKey;
    private final String apiSecret;
    private final String apiBase;
    private final Clock clock;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    CloudinaryPodStorage(@Value("${app.pod.cloudinary-url:}") String url,
                         @Value("${app.pod.cloudinary-api-base:https://api.cloudinary.com}") String apiBase,
                         Clock clock, ObjectMapper mapper) {
        this.clock = clock; this.mapper = mapper; this.apiBase = apiBase;
        String cloudName = null, key = null, secret = null;
        if (url != null && !url.isBlank()) {
            URI uri = URI.create(url.trim());
            String[] credentials = uri.getRawUserInfo() == null ? new String[0] : uri.getRawUserInfo().split(":", 2);
            if (!"cloudinary".equals(uri.getScheme()) || credentials.length != 2 || uri.getHost() == null)
                throw new IllegalStateException("CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>");
            key = URLDecoder.decode(credentials[0], StandardCharsets.UTF_8);
            secret = URLDecoder.decode(credentials[1], StandardCharsets.UTF_8);
            cloudName = uri.getHost();
        }
        this.cloud = cloudName; this.apiKey = key; this.apiSecret = secret;
    }

    @Override public String name() { return "cloudinary"; }

    @Override public boolean configured() { return cloud != null; }

    @Override
    public String store(String objectKey, byte[] bytes, String contentType) {
        if (!configured()) throw unavailable();
        String timestamp = String.valueOf(clock.instant().getEpochSecond());
        Map<String, String> signed = new LinkedHashMap<>();
        // Alphabetical order, as Cloudinary signs them.
        signed.put("overwrite", "false");
        signed.put("public_id", objectKey);
        signed.put("timestamp", timestamp);
        signed.put("type", "authenticated");
        StringBuilder toSign = new StringBuilder();
        signed.forEach((k, v) -> toSign.append(toSign.isEmpty() ? "" : "&").append(k).append('=').append(v));
        Map<String, String> fields = new LinkedHashMap<>(signed);
        fields.put("api_key", apiKey);
        fields.put("signature", HexFormat.of().formatHex(sha1(toSign + apiSecret)));
        String boundary = "----waypoint" + UUID.randomUUID();
        try {
            var body = new ByteArrayOutputStream();
            for (var field : fields.entrySet())
                body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field.getKey() + "\"\r\n\r\n"
                    + field.getValue() + "\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"proof\"\r\nContent-Type: "
                + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(bytes);
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
            var request = HttpRequest.newBuilder(URI.create(apiBase + "/v1_1/" + cloud + "/image/upload"))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                // The provider's message can name the account; keep it in the log, not the response.
                log.warn("Cloudinary upload failed with HTTP {}: {}", response.statusCode(), response.body());
                throw unavailable();
            }
            String publicId = mapper.readTree(response.body()).path("public_id").asText(null);
            if (publicId == null) throw unavailable();
            return publicId;
        } catch (IOException e) {
            log.warn("Cloudinary upload failed: {}", e.toString());
            throw unavailable();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    /** A signed link to the authenticated file (Cloudinary's URL signature: first 8 chars of base64url SHA-1). */
    @Override
    public String viewUrl(String objectKey) {
        if (!configured()) return null;
        String format = objectKey.endsWith("-signature") ? "png" : "jpg";
        String source = objectKey + "." + format;
        String signature = Base64.getUrlEncoder().encodeToString(sha1(source + apiSecret)).substring(0, 8);
        return "https://res.cloudinary.com/" + cloud + "/image/authenticated/s--" + signature + "--/v1/" + source;
    }

    private static byte[] sha1(String value) {
        try {
            return MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "POD_STORAGE_UNAVAILABLE",
            "Proof photos cannot be stored right now. Record the delivery without a photo, or try again later.");
    }
}
