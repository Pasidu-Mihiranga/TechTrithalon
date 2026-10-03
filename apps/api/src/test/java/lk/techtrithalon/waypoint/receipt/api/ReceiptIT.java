package lk.techtrithalon.waypoint.receipt.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Store receipt: confirm or dispute what the driver recorded, once per order; the dispatcher resolves disputes. */
class ReceiptIT extends ReferenceApiTestSupport {
    private Cookie dispatcher;
    private Cookie loader;
    private Cookie driver;
    private Cookie store;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
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
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        loader = login("LDR-001", "synthetic-loader-password");
        driver = login("DRV-001", "synthetic-driver-password");
        store = login("STM-001", "synthetic-store-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    @Test void theStoreSeesTheDeliveryThroughItsPhasesAndConfirmsReceiptOnce() throws Exception {
        publish();
        var pending = getJson(store, "/api/v1/store/deliveries").path("rows");
        assertThat(pending.size()).isEqualTo(1);                       // only the store's own order (OUT901)
        assertThat(pending.get(0).path("phase").asText()).isEqualTo("PENDING");
        assertThat(pending.get(0).path("driverName").asText()).isNotBlank();
        assertThat(pending.get(0).path("plannedArrival").asText()).isEqualTo("03:50:00");
        assertThat(pending.get(0).path("windowOpen").asText()).isEqualTo("05:00:00");
        var early = postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/receipt", Map.of(), 409);
        assertThat(early.path("code").asText()).isEqualTo("NOT_DELIVERED_YET");

        handOver(1);
        driverStart(1);
        assertThat(getJson(store, "/api/v1/store/deliveries").path("rows").get(0).path("phase").asText()).isEqualTo("IN_DELIVERY");
        deliver(freshOrder, "DELIVERED", null);
        var delivered = getJson(store, "/api/v1/store/deliveries/" + freshOrder);
        assertThat(delivered.path("row").path("phase").asText()).isEqualTo("DELIVERED");
        assertThat(delivered.path("row").path("deliveredUnits").asInt()).isEqualTo(12);
        assertThat(delivered.path("recipientName").asText()).isEqualTo("S. Perera");
        assertThat(delivered.path("canConfirm").asBoolean()).isTrue();
        assertThat(getJson(store, "/api/v1/store/deliveries?phase=PENDING").path("rows").size()).isZero();

        var confirmed = postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/receipt", Map.of(), 200);
        assertThat(confirmed.path("row").path("receipt").asText()).isEqualTo("CONFIRMED");
        assertThat(confirmed.path("canConfirm").asBoolean()).isFalse();
        assertThat(confirmed.path("status").asText()).isEqualTo("receipt_confirmed");
        assertThat(labels(confirmed)).containsSubsequence("Order placed", "Loaded and dispatched", "Delivered", "Receipt confirmed");
        assertThat(db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, freshOrder)).isEqualTo("receipt_confirmed");
        var again = postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/receipt", Map.of(), 409);
        assertThat(again.path("code").asText()).isEqualTo("RECEIPT_ALREADY_RECORDED");
        assertThat(again.path("outcome").asText()).isEqualTo("CONFIRMED");
        assertThat(postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue", Map.of("kind", "SHORT", "affectedUnits", 1), 409)
            .path("code").asText()).isEqualTo("RECEIPT_ALREADY_RECORDED");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('receipt.confirmed','order.receipt_confirmed') AND actor_id IS NOT NULL", Integer.class)).isEqualTo(2);

        // Another outlet's order, unknown ids and the wrong roles.
        failure(mvc.perform(get("/api/v1/store/deliveries/" + styleOrder).cookie(store)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(post("/api/v1/store/deliveries/" + styleOrder + "/receipt").cookie(store).header("X-Requested-With", "Waypoint")).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get("/api/v1/store/deliveries/999999").cookie(store)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get("/api/v1/store/deliveries")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/store/deliveries").cookie(driver)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/store/issues").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");
    }

    @Test void aDeliveryThatFailedCannotBeConfirmed() throws Exception {
        publish(); handOver(1); driverStart(1);
        deliver(freshOrder, "FAILED", "CUSTOMER_UNAVAILABLE");
        var detail = getJson(store, "/api/v1/store/deliveries/" + freshOrder);
        assertThat(detail.path("row").path("outcome").asText()).isEqualTo("FAILED");
        assertThat(detail.path("issueKind").asText()).isEqualTo("CUSTOMER_UNAVAILABLE");
        assertThat(detail.path("canConfirm").asBoolean()).isFalse();
        assertThat(postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/receipt", Map.of(), 409).path("code").asText()).isEqualTo("NOTHING_DELIVERED");
    }

    @Test void aDisputeOpensADiscrepancyTheDispatcherResolvesAndTheOrderThenCountsAsReceived() throws Exception {
        publish(); handOver(1); driverStart(1);
        deliver(freshOrder, "DELIVERED", null);

        assertThat(postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue", Map.of("kind", "BROKEN", "affectedUnits", 1), 400).path("code").asText())
            .isEqualTo("VALIDATION_FAILED");
        assertThat(postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue", Map.of("kind", "SHORT", "affectedUnits", 13), 422).path("code").asText())
            .isEqualTo("AFFECTED_UNITS_INVALID");
        assertThat(postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue", Map.of("kind", "OTHER", "affectedUnits", 1), 422).path("code").asText())
            .isEqualTo("NOTE_REQUIRED");
        var disputed = postJson(store, "/api/v1/store/deliveries/" + freshOrder + "/issue",
            Map.of("kind", "SHORT", "affectedUnits", 2, "note", "Two crates missing"), 200);
        assertThat(disputed.path("row").path("receipt").asText()).isEqualTo("DISPUTED");
        assertThat(disputed.path("status").asText()).isEqualTo("delivered");           // an open dispute leaves the order delivered
        assertThat(disputed.path("discrepancy").path("status").asText()).isEqualTo("OPEN");
        assertThat(labels(disputed)).contains("Issue reported");
        var issues = getJson(store, "/api/v1/store/issues?status=OPEN");
        assertThat(issues.size()).isEqualTo(1);
        assertThat(issues.get(0).path("affectedUnits").asInt()).isEqualTo(2);
        assertThat(getJson(store, "/api/v1/store/issues?status=RESOLVED").size()).isZero();
        failure(mvc.perform(get("/api/v1/store/issues?status=PENDING").cookie(store)).andReturn(), 400, "INVALID_STATUS");

        // The dispatcher sees it with the vehicle and driver, and decides.
        var open = getJson(dispatcher, "/api/v1/dispatcher/receipt-discrepancies?depot=Peliyagoda&status=OPEN");
        assertThat(open.size()).isEqualTo(1);
        assertThat(open.get(0).path("orderRef").asText()).isEqualTo("SYN001");
        assertThat(open.get(0).path("vehicleId").asText()).isEqualTo("VEH901");
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/receipt-discrepancies?depot=Kandy").size()).isZero();
        long id = open.get(0).path("id").asLong();
        String path = "/api/v1/dispatcher/receipt-discrepancies/" + id + "/resolve";
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", 0, "decision", "REFUND", "note", "x"), 400).path("code").asText()).isEqualTo("VALIDATION_FAILED");
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", 5, "decision", "CREDIT", "note", "Credit 2 units"), 409).path("code").asText()).isEqualTo("STALE_DISCREPANCY");
        failure(mvc.perform(post(path).cookie(store).header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"expectedVersion\":0,\"decision\":\"CREDIT\",\"note\":\"x\"}")).andReturn(), 403, "FORBIDDEN");
        var resolved = postJson(dispatcher, path, Map.of("expectedVersion", 0, "decision", "CREDIT", "note", "Credit 2 units on the next invoice"), 200);
        assertThat(resolved.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(resolved.path("resolvedByName").asText()).isNotBlank();
        assertThat(postJson(dispatcher, path, Map.of("expectedVersion", 1, "decision", "NO_ACTION", "note", "again"), 409).path("code").asText()).isEqualTo("DISCREPANCY_RESOLVED");
        assertThat(db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, freshOrder)).isEqualTo("receipt_confirmed");
        var after = getJson(store, "/api/v1/store/deliveries/" + freshOrder);
        assertThat(after.path("row").path("receipt").asText()).isEqualTo("RESOLVED");
        assertThat(labels(after)).contains("Issue resolved by the dispatcher");
        assertThat(getJson(store, "/api/v1/store/issues?status=RESOLVED").size()).isEqualTo(1);
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/receipt-discrepancies?status=OPEN").size()).isZero();
    }

    private static List<String> labels(JsonNode detail) {
        var labels = new java.util.ArrayList<String>();
        detail.path("timeline").forEach(e -> labels.add(e.path("label").asText()));
        return labels;
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

    private void driverStart(int tripIndex) throws Exception {
        postJson(driver, "/api/v1/driver/trips/" + tripIndex + "/start", Map.of("planVersion", 1), 200);
    }

    /** Arrives at the order's outlet and records its outcome (the synthetic stack has no proof storage). */
    private void deliver(long order, String outcome, String issueKind) throws Exception {
        String outlet = db.queryForObject("SELECT outlet_id FROM customer_order WHERE id=?", String.class, order);
        long version = getJson(driver, "/api/v1/driver/trips/1").path("version").asLong();
        postJson(driver, "/api/v1/driver/trips/1/stops/" + outlet + "/arrive", Map.of("expectedVersion", version), 200);
        Map<String, Object> body = new HashMap<>(Map.of("expectedVersion", version + 1, "outcome", outcome));
        if (issueKind != null) body.put("issueKind", issueKind); else body.put("recipientName", "S. Perera");
        postJson(driver, "/api/v1/driver/trips/1/orders/" + order + "/outcome", body, 200);
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
