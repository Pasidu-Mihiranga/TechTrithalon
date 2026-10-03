package lk.techtrithalon.waypoint.exceptions.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The dispatcher's exceptions queue: one list over loading, driver, offline and receipt problems, handled through their owners. */
class ExceptionsIT extends ReferenceApiTestSupport {
    private static final String RUN = "date=2026-06-26&depot=Peliyagoda";
    private static final String QUEUE = "/api/v1/dispatcher/exceptions";
    private static final Instant T0 = Instant.parse("2026-06-25T23:40:00Z");
    private Cookie dispatcher;
    private Cookie loader;
    private Cookie driver;
    private Cookie store;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        reset();
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        loader = login("LDR-001", "synthetic-loader-password");
        driver = login("DRV-001", "synthetic-driver-password");
        store = login("STM-001", "synthetic-store-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    @AfterEach void reset() {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM operational_exception");
        db.update("DELETE FROM receipt_discrepancy"); db.update("DELETE FROM receipt_confirmation"); db.update("DELETE FROM sync_command");
        db.update("DELETE FROM pod_asset"); db.update("DELETE FROM delivery_record"); db.update("DELETE FROM stop_visit"); db.update("DELETE FROM delivery_trip");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan"); db.update("DELETE FROM planning_snapshot"); db.update("DELETE FROM audit_event"); db.update("DELETE FROM fuel_ledger");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='LDR-001'");
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
    }

    @Test void theQueueGathersEveryKindAndEachIsClosedThroughItsOwner() throws Exception {
        publish();
        // 1. loading shortfall on trip 2 (the dock)
        long task2 = db.queryForObject("SELECT id FROM load_task WHERE trip_index=2 AND status<>'superseded'", Long.class);
        long line2 = getJson(loader, "/api/v1/loader/load-tasks/" + task2).path("task").path("lines").get(0).path("id").asLong();
        postJson(loader, "/api/v1/loader/load-tasks/" + task2 + "/lines/" + line2 + "/shortfall",
            Map.of("expectedVersion", 0, "kind", "MISSING", "shortUnits", 2, "note", "Two crates not on the dock", "holdsVehicle", true), 200);
        // 2. partial delivery on trip 1, 3. the store disputes it
        handOver(1);
        postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);
        long version = getJson(driver, "/api/v1/driver/trips/1").path("version").asLong();
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", version), 200);
        postJson(driver, "/api/v1/driver/trips/1/orders/" + freshOrder + "/outcome", Map.of("expectedVersion", version + 1, "outcome", "PARTIAL",
            "deliveredUnits", 10, "issueKind", "DAMAGED", "recipientName", "S. Perera"), 200);
        postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue", Map.of("kind", "SHORT", "affectedUnits", 2, "note", "Two crates missing"), 200);
        // 4. a phone action the server could not apply
        var rejected = postJson(driver, "/api/v1/driver/sync", Map.of("actions", List.of(action("STOP_ARRIVE", 1, 30, Map.of("outletId", "OUT903")))), 200)
            .path("results").get(0);
        assertThat(rejected.path("result").asText()).isIn("REJECTED", "CONFLICT");

        var dashboard = getJson(dispatcher, "/api/v1/dispatcher/dashboard?" + RUN);
        assertThat(dashboard.path("exceptions").path("value").asInt()).isEqualTo(4);
        assertThat(dashboard.path("activeTrips").path("value").asInt()).isEqualTo(1);
        assertThat(dashboard.path("tripsReady").path("value").asInt()).isEqualTo(1);       // trip 2 is still at the dock

        var queue = getJson(dispatcher, QUEUE + "?" + RUN);
        assertThat(queue.path("counts").path("all").asInt()).isEqualTo(4);
        assertThat(queue.path("counts").path("open").asInt()).isEqualTo(4);
        assertThat(kinds(queue)).containsExactlyInAnyOrder("LOADING_SHORTFALL", "DELIVERY_PARTIAL", "RECEIPT_DISPUTE", rejected.path("result").asText().equals("REJECTED") ? "SYNC_REJECTED" : "SYNC_CONFLICT");
        var partial = item(queue, "DELIVERY_PARTIAL");
        assertThat(partial.path("orderRef").asText()).isEqualTo("SYN001");
        assertThat(partial.path("vehicleId").asText()).isEqualTo("VEH901");
        assertThat(partial.path("driverName").asText()).isNotBlank();
        assertThat(partial.path("detail").asText()).contains("10 of 12 units").contains("damaged");
        assertThat(partial.path("decisions").size()).isZero();
        assertThat(item(queue, "LOADING_SHORTFALL").path("decisions").toString()).contains("SEND_SHORT", "REPLANNED");
        assertThat(item(queue, "RECEIPT_DISPUTE").path("decisions").toString()).contains("CREDIT");
        assertThat(getJson(dispatcher, QUEUE + "?date=2026-06-26&depot=Kandy").path("counts").path("all").asInt()).isZero();

        // Scope and roles.
        failure(mvc.perform(get(QUEUE + "?date=2026-06-26").cookie(dispatcher)).andReturn(), 400, "DEPOT_REQUIRED");
        failure(mvc.perform(get(QUEUE + "?" + RUN)).andReturn(), 401, "UNAUTHENTICATED");
        for (var who : List.of(loader, driver, store)) failure(mvc.perform(get(QUEUE + "?" + RUN).cookie(who)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(post(QUEUE + "/LOADING_ISSUE/1/claim?" + RUN).cookie(store).header("X-Requested-With", "Waypoint")).andReturn(), 403, "FORBIDDEN");

        // Taking an item moves it to In Progress under the dispatcher's name.
        String loadingId = item(queue, "LOADING_SHORTFALL").path("sourceId").asText();
        var taken = postJson(dispatcher, QUEUE + "/LOADING_ISSUE/" + loadingId + "/claim?" + RUN, Map.of(), 200);
        assertThat(taken.path("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(taken.path("ownerName").asText()).isNotBlank();
        var afterClaim = getJson(dispatcher, QUEUE + "?" + RUN).path("counts");
        assertThat(afterClaim.path("inProgress").asInt()).isEqualTo(1);
        assertThat(afterClaim.path("open").asInt()).isEqualTo(3);
        failure(mvc.perform(post(QUEUE + "/LOADING_ISSUE/999999/claim?" + RUN).cookie(dispatcher).header("X-Requested-With", "Waypoint")).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(post(QUEUE + "/BOGUS/1/claim?" + RUN).cookie(dispatcher).header("X-Requested-With", "Waypoint")).andReturn(), 400, "INVALID_TYPE");

        // Loading shortfall: the decision goes through the loading module (its rules, its stale check).
        String path = QUEUE + "/LOADING_ISSUE/" + loadingId + "/resolve?" + RUN;
        int issueVersion = taken.path("version").asInt();
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", issueVersion, "decision", "SEND_SHORT"), 422).path("code").asText()).isEqualTo("NOTE_REQUIRED");
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", issueVersion, "decision", "BIN", "note", "x"), 400).path("code").asText()).isEqualTo("INVALID_DECISION");
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", issueVersion + 4, "decision", "SEND_SHORT", "note", "Send short"), 409).path("code").asText())
            .isEqualTo("STALE_ISSUE");
        var closed = postJson(dispatcher, path, Map.of("expectedVersion", issueVersion, "decision", "SEND_SHORT", "note", "Vehicle leaves with 10 units"), 200);
        assertThat(closed.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(closed.path("decision").asText()).isEqualTo("SEND_SHORT");
        assertThat(db.queryForObject("SELECT status FROM loading_issue WHERE id=?", String.class, Long.parseLong(loadingId))).isEqualTo("RESOLVED");
        assertThat(db.queryForObject("SELECT status FROM operational_exception WHERE source_type='LOADING_ISSUE'", String.class)).isEqualTo("RESOLVED");
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", 9, "decision", "SEND_SHORT", "note", "again"), 409).path("code").asText()).isEqualTo("EXCEPTION_RESOLVED");
        assertThat(postJson(dispatcher, QUEUE + "/LOADING_ISSUE/" + loadingId + "/claim?" + RUN, Map.of(), 409).path("code").asText()).isEqualTo("EXCEPTION_RESOLVED");

        // Store dispute: the receipt module closes it and the order counts as received.
        var dispute = item(getJson(dispatcher, QUEUE + "?" + RUN), "RECEIPT_DISPUTE");
        var credited = postJson(dispatcher, QUEUE + "/RECEIPT_DISCREPANCY/" + dispute.path("sourceId").asText() + "/resolve?" + RUN,
            Map.of("expectedVersion", dispute.path("version").asInt(), "decision", "CREDIT", "note", "Credit 2 units"), 200);
        assertThat(credited.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, freshOrder)).isEqualTo("receipt_confirmed");
        assertThat(db.queryForObject("SELECT status FROM receipt_discrepancy", String.class)).isEqualTo("RESOLVED");

        // Driver problem: no workflow of its own, so it is claimed then acknowledged with a note.
        var problem = item(getJson(dispatcher, QUEUE + "?" + RUN), "DELIVERY_PARTIAL");
        String problemPath = QUEUE + "/DELIVERY_PROBLEM/" + problem.path("sourceId").asText();
        var claimed = postJson(dispatcher, problemPath + "/claim?" + RUN, Map.of(), 200);
        assertThat(claimed.path("version").asInt()).isEqualTo(1);
        assertThat(postJson(dispatcher, problemPath + "/resolve?" + RUN, Map.of("expectedVersion", 0, "note", "Seen"), 409).path("code").asText()).isEqualTo("STALE_EXCEPTION");
        assertThat(postJson(dispatcher, problemPath + "/resolve?" + RUN, Map.of("expectedVersion", 1, "note", " "), 422).path("code").asText()).isEqualTo("NOTE_REQUIRED");
        var acked = postJson(dispatcher, problemPath + "/resolve?" + RUN, Map.of("expectedVersion", 1, "note", "Called the driver; damaged crates logged"), 200);
        assertThat(acked.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(acked.path("resolvedByName").asText()).isNotBlank();
        assertThat(acked.path("resolutionNote").asText()).contains("damaged crates");
        assertThat(postJson(dispatcher, problemPath + "/resolve?" + RUN, Map.of("expectedVersion", 2, "note", "twice"), 409).path("code").asText()).isEqualTo("EXCEPTION_RESOLVED");

        // Offline review item: acknowledged straight away (no state row yet, version 0).
        var sync = item(getJson(dispatcher, QUEUE + "?" + RUN), rejected.path("result").asText().equals("REJECTED") ? "SYNC_REJECTED" : "SYNC_CONFLICT");
        assertThat(sync.path("driverName").asText()).isNotBlank();
        var syncAck = postJson(dispatcher, QUEUE + "/SYNC_REVIEW/" + sync.path("sourceId").asText() + "/resolve?" + RUN,
            Map.of("expectedVersion", 0, "note", "Stop was not on the route"), 200);
        assertThat(syncAck.path("status").asText()).isEqualTo("RESOLVED");

        var done = getJson(dispatcher, QUEUE + "?" + RUN);
        assertThat(done.path("counts").path("resolved").asInt()).isEqualTo(4);
        assertThat(done.path("counts").path("open").asInt()).isZero();
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/dashboard?" + RUN).path("exceptions").path("value").asInt()).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('exception.claimed','exception.resolved') AND actor_id IS NOT NULL", Integer.class))
            .isEqualTo(6);
    }

    @Test void aDeliveredRecordKeptWithAReviewReasonAppearsAsADeliveryReview() throws Exception {
        publish(); handOver(1);
        postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);
        long version = getJson(driver, "/api/v1/driver/trips/1").path("version").asLong();
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", version), 200);
        postJson(driver, "/api/v1/driver/trips/1/orders/" + freshOrder + "/outcome",
            Map.of("expectedVersion", version + 1, "outcome", "DELIVERED", "recipientName", "S. Perera"), 200);
        assertThat(getJson(dispatcher, QUEUE + "?" + RUN).path("counts").path("all").asInt()).isZero();   // a clean delivery is not an exception
        db.update("UPDATE delivery_record SET review_reason='PROOF_MISSING'");                               // what an offline sync that lost its proof stores
        var item = item(getJson(dispatcher, QUEUE + "?" + RUN), "DELIVERY_REVIEW");
        assertThat(item.path("detail").asText()).contains("proof did not arrive");
        assertThat(item.path("title").asText()).contains("SYN001");
    }

    private static List<String> kinds(JsonNode queue) {
        List<String> kinds = new ArrayList<>();
        queue.path("items").forEach(i -> kinds.add(i.path("kind").asText()));
        return kinds;
    }

    private static JsonNode item(JsonNode queue, String kind) {
        for (var i : queue.path("items")) if (kind.equals(i.path("kind").asText())) return i;
        throw new AssertionError("no " + kind + " in " + kinds(queue));
    }

    private Map<String, Object> action(String type, int trip, int minutes, Map<String, Object> fields) {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("clientActionId", UUID.randomUUID().toString());
        a.put("actionType", type);
        a.put("planDate", "2026-06-26");
        a.put("tripIndex", trip);
        a.put("occurredAt", T0.plusSeconds(minutes * 60L).toString());
        a.putAll(fields);
        return a;
    }

    private void publish() throws Exception {
        long snapshot = postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201).path("id").asLong();
        long plan = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "First version"), 201).path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
        addTrip(plan, 1, "Style", 2, List.of(styleOrder));
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Publish"), 200);
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

    private JsonNode getJson(Cookie who, String path) throws Exception {
        return mapper.readTree(mvc.perform(get(path).cookie(who)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode postJson(Cookie who, String path, Object body, int expected) throws Exception {
        var response = mvc.perform(post(path).cookie(who).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(body))).andExpect(status().is(expected)).andReturn();
        if (expected >= 400) failure(response, expected, mapper.readTree(response.getResponse().getContentAsString()).path("code").asText());
        return mapper.readTree(response.getResponse().getContentAsString());
    }
}
