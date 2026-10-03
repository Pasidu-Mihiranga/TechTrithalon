package lk.techtrithalon.waypoint.delivery.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.imageio.ImageIO;
import lk.techtrithalon.waypoint.delivery.application.PodStorage;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** The driver's workflow on a handed-over trip: start, arrive, record with proof, depart, finish; and republish rules. */
@Import(DeliveryWorkflowIT.InMemoryStorage.class)
class DeliveryWorkflowIT extends ReferenceApiTestSupport {
    /** Synthetic stand-in for Cloudinary; keeps bytes in memory for the test run only. */
    @TestConfiguration
    static class InMemoryStorage {
        static final Map<String, byte[]> files = new ConcurrentHashMap<>();
        @Bean @Primary PodStorage testPodStorage() {
            return new PodStorage() {
                public String name() { return "test"; }
                public boolean configured() { return true; }
                public String store(String key, byte[] bytes, String contentType) { files.put(key, bytes); return key; }
                public String viewUrl(String key) { return "https://storage.test/" + key; }
            };
        }
    }

    private Cookie dispatcher;
    private Cookie loader;
    private Cookie driver;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM receipt_discrepancy"); db.update("DELETE FROM receipt_confirmation"); db.update("DELETE FROM sync_command"); db.update("DELETE FROM pod_asset"); db.update("DELETE FROM delivery_record"); db.update("DELETE FROM stop_visit"); db.update("DELETE FROM delivery_trip");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM fuel_ledger");
        db.update("DELETE FROM user_session WHERE user_id IN (SELECT id FROM app_user WHERE username='SYN-DRIVER-2')");
        db.update("DELETE FROM app_user WHERE username='SYN-DRIVER-2'");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='LDR-001'");
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        loader = login("LDR-001", "synthetic-loader-password");
        driver = login("DRV-001", "synthetic-driver-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    @Test void theDriverRunsAHandedOverTripWithProofAndFinishesIt() throws Exception {
        publishFirstVersion();
        var home = getJson(driver, "/api/v1/driver/home?date=2026-06-26");
        assertThat(home.path("vehicleId").asText()).isEqualTo("VEH901");
        assertThat(home.path("trips").size()).isEqualTo(2);
        assertThat(home.path("trips").get(0).path("state").asText()).isEqualTo("LOADING");
        assertThat(home.path("progress").path("orders").asInt()).isEqualTo(2);
        // Default date is the demo operating day.
        assertThat(getJson(driver, "/api/v1/driver/home").path("planDate").asText()).isEqualTo("2026-06-26");

        var notLoaded = postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 409);
        assertThat(notLoaded.path("code").asText()).isEqualTo("TRIP_NOT_HANDED_OVER");
        handOver(1);
        var ready = getJson(driver, "/api/v1/driver/trips/1");
        assertThat(ready.path("card").path("state").asText()).isEqualTo("READY");
        assertThat(ready.path("startBlocker").isNull()).isTrue();
        assertThat(ready.path("stops").get(0).path("plannedArrival").asText()).isNotBlank();
        assertThat(ready.path("stops").get(0).path("eta").isNull()).isTrue();
        var stalePlan = postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 7), 409);
        assertThat(stalePlan.path("code").asText()).isEqualTo("ROUTE_CHANGED");
        assertThat(stalePlan.path("currentPlanVersion").asInt()).isEqualTo(1);

        var started = postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);
        assertThat(started.path("card").path("state").asText()).isEqualTo("IN_PROGRESS");
        assertThat(started.path("version").asInt()).isZero();
        assertThat(started.path("currentStopSeq").asInt()).isEqualTo(1);
        assertThat(started.path("stops").get(0).path("eta").asText()).isNotBlank();
        assertThat(orderStatus(freshOrder)).isEqualTo("in_transit");
        assertThat(postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 409).path("code").asText())
            .isEqualTo("TRIP_ALREADY_STARTED");

        var early = outcome(1, freshOrder, Map.of("expectedVersion", 0, "outcome", "DELIVERED", "recipientName", "S. Perera"), 409);
        assertThat(early.path("code").asText()).isEqualTo("NOT_AT_STOP");
        var arrived = postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", 0), 200);
        assertThat(arrived.path("stops").get(0).path("status").asText()).isEqualTo("ARRIVED");
        var stale = postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/depart", Map.of("expectedVersion", 0), 409);
        assertThat(stale.path("code").asText()).isEqualTo("STALE_TRIP");
        var incomplete = postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/depart", Map.of("expectedVersion", 1), 409);
        assertThat(incomplete.path("code").asText()).isEqualTo("STOP_INCOMPLETE");
        assertThat(incomplete.path("pendingOrders").get(0).asText()).isEqualTo("SYN001");

        var text = upload(1, freshOrder, "PHOTO", "not an image".getBytes(), "text/plain", 422);
        assertThat(text.path("code").asText()).isEqualTo("FILE_TYPE_INVALID");
        var badKind = upload(1, freshOrder, "VIDEO", image("jpg", 40, 30), "image/jpeg", 400);
        assertThat(badKind.path("code").asText()).isEqualTo("INVALID_KIND");
        var photo = upload(1, freshOrder, "PHOTO", image("png", 3200, 1600), "image/png", 201);
        assertThat(photo.path("width").asInt()).isEqualTo(1600);
        assertThat(photo.path("height").asInt()).isEqualTo(800);
        assertThat(db.queryForObject("SELECT content_type FROM pod_asset WHERE id=?", String.class, photo.path("id").asLong())).isEqualTo("image/jpeg");
        long signature = upload(1, freshOrder, "SIGNATURE", image("png", 300, 120), "image/png", 201).path("id").asLong();

        var noRecipient = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "DELIVERED"), 422);
        assertThat(noRecipient.path("code").asText()).isEqualTo("RECIPIENT_REQUIRED");
        var noProof = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "DELIVERED", "recipientName", "S. Perera"), 422);
        assertThat(noProof.path("code").asText()).isEqualTo("PROOF_REQUIRED");
        var badOutcome = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "LOST"), 400);
        assertThat(badOutcome.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        var delivered = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "DELIVERED", "recipientName", "S. Perera",
            "proofIds", List.of(photo.path("id").asLong(), signature)), 200);
        var recorded = delivered.path("stops").get(0).path("orders").get(0).path("outcome");
        assertThat(recorded.path("outcome").asText()).isEqualTo("DELIVERED");
        assertThat(recorded.path("deliveredUnits").asInt()).isEqualTo(12);
        assertThat(recorded.path("photos").asInt()).isEqualTo(1);
        assertThat(recorded.path("signatures").asInt()).isEqualTo(1);
        assertThat(orderStatus(freshOrder)).isEqualTo("delivered");
        assertThat(outcome(1, freshOrder, Map.of("expectedVersion", 2, "outcome", "FAILED", "issueKind", "OTHER"), 409).path("code").asText())
            .isEqualTo("ORDER_ALREADY_RECORDED");

        var unfinished = postJson(driver, "/api/v1/driver/trips/1/complete", Map.of("expectedVersion", 2), 409);
        assertThat(unfinished.path("code").asText()).isEqualTo("TRIP_INCOMPLETE");
        var departed = postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/depart", Map.of("expectedVersion", 2), 200);
        assertThat(departed.path("stops").get(0).path("status").asText()).isEqualTo("COMPLETED");
        assertThat(departed.path("card").path("stopsDone").asInt()).isEqualTo(1);
        var finished = postJson(driver, "/api/v1/driver/trips/1/complete", Map.of("expectedVersion", 3), 200);
        assertThat(finished.path("card").path("state").asText()).isEqualTo("COMPLETED");
        assertThat(finished.path("card").path("completedAt").isNull()).isFalse();

        var detail = getJson(driver, "/api/v1/driver/orders/" + freshOrder);
        assertThat(detail.path("status").asText()).isEqualTo("delivered");
        assertThat(detail.path("outcome").path("recipientName").asText()).isEqualTo("S. Perera");
        assertThat(detail.path("proofs").size()).isEqualTo(2);
        assertThat(detail.path("proofs").get(0).path("url").asText()).startsWith("https://storage.test/waypoint/pod/2026-06-26/SYN001-");
        assertThat(detail.path("timeline").get(detail.path("timeline").size() - 1).path("label").asText()).isEqualTo("Delivered");
        var deliveries = getJson(driver, "/api/v1/driver/deliveries?date=2026-06-26");
        assertThat(deliveries.path("rows").get(0).path("status").asText()).isEqualTo("DELIVERED");
        assertThat(deliveries.path("rows").get(1).path("status").asText()).isEqualTo("PENDING");
        var past = getJson(driver, "/api/v1/driver/past-trips?before=2026-06-27");
        assertThat(past.get(0).path("delivered").asInt()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('delivery_trip.started','stop.arrived','delivery.recorded','stop.departed','delivery_trip.completed')",
            Integer.class)).isEqualTo(5);
    }

    @Test void partialAndFailedOutcomesNeedAReasonAndOtherDriversCannotSeeTheTrip() throws Exception {
        publishFirstVersion();
        handOver(1);
        handOver(2);
        var blocked = postJson(driver, "/api/v1/driver/trips/2/start", Map.of("planVersion", 1), 409);
        assertThat(blocked.path("code").asText()).isEqualTo("PREVIOUS_TRIP_OPEN");
        assertThat(getJson(driver, "/api/v1/driver/trips/2").path("startBlocker").asText()).isEqualTo("Finish trip 1 first");
        postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", 0), 200);
        var noReason = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "PARTIAL", "deliveredUnits", 10, "recipientName", "S. Perera"), 422);
        assertThat(noReason.path("code").asText()).isEqualTo("ISSUE_REQUIRED");
        var tooMany = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "PARTIAL", "deliveredUnits", 12, "issueKind", "DAMAGED",
            "recipientName", "S. Perera"), 422);
        assertThat(tooMany.path("code").asText()).isEqualTo("DELIVERED_UNITS_INVALID");
        long photo = upload(1, freshOrder, "PHOTO", image("jpg", 400, 300), "image/jpeg", 201).path("id").asLong();
        var partial = outcome(1, freshOrder, Map.of("expectedVersion", 1, "outcome", "PARTIAL", "deliveredUnits", 10, "issueKind", "DAMAGED",
            "recipientName", "S. Perera", "notes", "Two crates crushed", "proofIds", List.of(photo)), 200);
        assertThat(partial.path("card").path("issues").asInt()).isEqualTo(1);
        assertThat(orderStatus(freshOrder)).isEqualTo("partial");
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/depart", Map.of("expectedVersion", 2), 200);
        postJson(driver, "/api/v1/driver/trips/1/complete", Map.of("expectedVersion", 3), 200);

        postJson(driver, "/api/v1/driver/trips/2/start", Map.of("planVersion", 1), 200);
        postJson(driver, "/api/v1/driver/trips/2/stops/OUT902/arrive", Map.of("expectedVersion", 0), 200);
        var failed = outcome(2, styleOrder, Map.of("expectedVersion", 1, "outcome", "FAILED", "issueKind", "CUSTOMER_UNAVAILABLE"), 200);
        assertThat(failed.path("stops").get(0).path("orders").get(0).path("outcome").path("deliveredUnits").asInt()).isZero();
        assertThat(orderStatus(styleOrder)).isEqualTo("failed");

        // Ownership and roles.
        db.update("INSERT INTO app_user (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
            "SYN-DRIVER-2", "Synthetic second driver", new BCryptPasswordEncoder(4).encode("synthetic-second-password"), "DRIVER");
        var other = login("SYN-DRIVER-2", "synthetic-second-password");
        failure(mvc.perform(get("/api/v1/driver/trips/1").cookie(other)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get("/api/v1/driver/orders/" + freshOrder).cookie(other)).andReturn(), 404, "NOT_FOUND");
        assertThat(getJson(other, "/api/v1/driver/home?date=2026-06-26").path("trips").size()).isZero();
        failure(mvc.perform(get("/api/v1/driver/home")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/driver/home").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/driver/home").cookie(loader)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/driver/trips/9").cookie(driver)).andReturn(), 404, "NOT_FOUND");
    }

    @Test void aRevisionCannotMoveOrdersOffATripThatHasLeftButMayKeepItsHandover() throws Exception {
        publishFirstVersion();
        handOver(1);
        postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);

        // Deferring the order on the departed trip is refused at publication.
        long v2 = revise();
        long freshTrip = tripId(v2, 1);
        send(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/dispatcher/plans/" + v2 + "/trips/" + freshTrip),
            dispatcher, Map.of("expectedVersion", 1, "reason", "Drop fresh trip"), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/orders/" + freshOrder + "/defer",
            Map.of("expectedVersion", 2, "reason", "Try to pull it back", "reasonCode", "OTHER"), 200);
        var refused = postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/publish", Map.of("expectedVersion", 3, "reason", "Publish"), 409);
        assertThat(refused.path("code").asText()).isEqualTo("TRIP_ALREADY_DEPARTED");
        assertThat(refused.path("detail").asText()).contains("VEH901 trip 1");

        // A revision that keeps the departed trip publishes; the trip stays handed over and running.
        db.update("DELETE FROM plan WHERE id=?", v2);
        long v3 = revise();
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v3 + "/publish", Map.of("expectedVersion", 1, "reason", "Publish unchanged"), 200);
        var trip = getJson(driver, "/api/v1/driver/trips/1");
        assertThat(trip.path("card").path("planVersion").asInt()).isEqualTo(2);
        assertThat(trip.path("card").path("loadStatus").asText()).isEqualTo("loaded");
        assertThat(trip.path("card").path("state").asText()).isEqualTo("IN_PROGRESS");
        assertThat(trip.path("routeChanged").asBoolean()).isTrue();
        assertThat(orderStatus(freshOrder)).isEqualTo("in_transit");
        long current = db.queryForObject("SELECT id FROM load_task WHERE trip_index=1 AND status<>'superseded'", Long.class);
        assertThat(db.queryForObject("SELECT acknowledgement_required FROM load_task WHERE id=?", Boolean.class, current)).isFalse();
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", 0), 200);
    }

    private long publishFirstVersion() throws Exception {
        long snapshot = snapshot();
        long plan = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "First version"), 201)
            .path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
        addTrip(plan, 1, "Style", 2, List.of(styleOrder));
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Publish"), 200);
        return plan;
    }

    private long revise() throws Exception {
        return postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot(), "reason", "Revise on the road"), 201)
            .path("plan").path("id").asLong();
    }

    private long snapshot() throws Exception {
        return postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
    }

    private long tripId(long plan, int tripIndex) {
        return db.queryForObject("SELECT id FROM trip WHERE plan_id=? AND trip_index=?", Long.class, plan, tripIndex);
    }

    private void addTrip(long plan, int version, String brand, int slot, List<Long> orders) throws Exception {
        Map<String, Object> trip = new HashMap<>(Map.of("vehicleId", "VEH901", "tripIndex", slot, "brand", brand, "district", "Alpha", "orderIds", orders));
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + plan + "/trips", Map.of("expectedVersion", version, "reason", "Assign", "trip", trip), 200);
    }

    private void handOver(int tripIndex) throws Exception {
        long task = db.queryForObject("SELECT id FROM load_task WHERE trip_index=? AND status<>'superseded'", Long.class, tripIndex);
        var detail = getJson(loader, "/api/v1/loader/load-tasks/" + task);
        int version = detail.path("task").path("version").asInt();
        for (var line : detail.path("task").path("lines"))
            postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line.path("id").asLong() + "/loaded", Map.of("expectedVersion", version++), 200);
        postJson(loader, "/api/v1/loader/load-tasks/" + task + "/loaded", Map.of("expectedVersion", version), 200);
    }

    private String orderStatus(long order) {
        return db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, order);
    }

    private JsonNode outcome(int trip, long order, Map<String, Object> body, int expected) throws Exception {
        return postJson(driver, "/api/v1/driver/trips/" + trip + "/orders/" + order + "/outcome", body, expected);
    }

    private JsonNode upload(int trip, long order, String kind, byte[] bytes, String type, int expected) throws Exception {
        var response = mvc.perform(multipart("/api/v1/driver/trips/" + trip + "/orders/" + order + "/proofs")
                .file(new MockMultipartFile("file", "proof", type, bytes)).param("kind", kind)
                .cookie(driver).header("X-Requested-With", "Waypoint"))
            .andExpect(status().is(expected)).andReturn();
        var body = mapper.readTree(response.getResponse().getContentAsString());
        if (expected >= 400) failure(response, expected, body.path("code").asText());
        return body;
    }

    private static byte[] image(String format, int width, int height) throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), format, out);
        return out.toByteArray();
    }

    private JsonNode getJson(Cookie who, String path) throws Exception {
        return mapper.readTree(mvc.perform(get(path).cookie(who)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode postJson(Cookie who, String path, Object body, int expected) throws Exception {
        return send(post(path), who, body, expected);
    }

    private JsonNode send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, Cookie who, Object body,
                          int expected) throws Exception {
        var response = mvc.perform(builder.cookie(who).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(body))).andExpect(status().is(expected)).andReturn();
        if (expected >= 400) failure(response, expected, mapper.readTree(response.getResponse().getContentAsString()).path("code").asText());
        return mapper.readTree(response.getResponse().getContentAsString());
    }
}
