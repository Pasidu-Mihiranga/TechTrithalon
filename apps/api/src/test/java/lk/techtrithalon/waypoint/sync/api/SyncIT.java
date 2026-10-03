package lk.techtrithalon.waypoint.sync.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

/** The driver's outbox replay: idempotent, in device order, with conflicts, rejections and the driver's record winning. */
class SyncIT extends ReferenceApiTestSupport {
    private static final Instant T0 = Instant.parse("2026-06-25T23:40:00Z"); // 05:10 Colombo on the delivery day
    private Cookie dispatcher;
    private Cookie loader;
    private Cookie driver;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        reset();
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        loader = login("LDR-001", "synthetic-loader-password");
        driver = login("DRV-001", "synthetic-driver-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    /** Leaves no synthetic SYN003 or field records behind for other test classes. */
    @AfterEach void reset() {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM receipt_discrepancy"); db.update("DELETE FROM receipt_confirmation"); db.update("DELETE FROM sync_command");
        db.update("DELETE FROM pod_asset"); db.update("DELETE FROM delivery_record"); db.update("DELETE FROM stop_visit"); db.update("DELETE FROM delivery_trip");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM fuel_ledger");
        db.update("DELETE FROM customer_order WHERE ref='SYN003'");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='LDR-001'");
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
    }

    @Test void anOfflineTripReplaysInDeviceOrderOnceAndARetryIsADuplicate() throws Exception {
        publish(List.of(freshOrder), List.of(styleOrder));
        handOver(1);
        var start = action("TRIP_START", 1, 0, Map.of("planVersion", 1));
        var arrive = action("STOP_ARRIVE", 1, 5, Map.of("outletId", "OUT901"));
        var deliver = action("ORDER_OUTCOME", 1, 9, Map.of("orderId", freshOrder, "outcome", "DELIVERED", "recipientName", "S. Perera"));
        var depart = action("STOP_DEPART", 1, 12, Map.of("outletId", "OUT901"));
        var finish = action("TRIP_COMPLETE", 1, 40, Map.of());
        // Sent out of order: the server applies them in the order they happened.
        var batch = List.of(deliver, finish, start, depart, arrive);
        var first = sync(batch);
        assertThat(results(first, "result")).containsExactly("APPLIED", "APPLIED", "APPLIED", "APPLIED", "APPLIED");
        assertThat(first.path("results").get(0).path("clientActionId").asText()).isEqualTo(start.get("clientActionId"));
        assertThat(orderStatus(freshOrder)).isEqualTo("delivered");
        assertThat(db.queryForObject("SELECT status FROM delivery_trip WHERE trip_index=1", String.class)).isEqualTo("completed");
        // Device times are kept as recorded; the server time is separate.
        assertThat(db.queryForObject("SELECT occurred_at FROM delivery_record WHERE order_id=?", java.sql.Timestamp.class, freshOrder).toInstant())
            .isEqualTo(T0.plusSeconds(9 * 60));
        assertThat(db.queryForObject("SELECT arrived_at FROM stop_visit", java.sql.Timestamp.class).toInstant()).isEqualTo(T0.plusSeconds(5 * 60));
        assertThat(db.queryForObject("SELECT started_at FROM delivery_trip WHERE trip_index=1", java.sql.Timestamp.class).toInstant()).isEqualTo(T0);

        // The response was lost and the phone retries: nothing applies twice.
        var retry = sync(batch);
        assertThat(results(retry, "result")).containsOnly("DUPLICATE");
        assertThat(results(retry, "code")).containsOnly("APPLIED");
        assertThat(db.queryForObject("SELECT count(*) FROM delivery_record", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM stop_visit", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM sync_command", Integer.class)).isEqualTo(5);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='delivery.recorded'", Integer.class)).isEqualTo(1);
        // The online view agrees.
        assertThat(getJson(driver, "/api/v1/driver/trips/1").path("card").path("state").asText()).isEqualTo("COMPLETED");
    }

    @Test void conflictsAndRejectionsAreStoredAndAnAlreadyRecordedOutcomeIsNotAConflict() throws Exception {
        publish(List.of(freshOrder), List.of(styleOrder));
        handOver(1);
        sync(List.of(action("TRIP_START", 1, 0, Map.of()), action("STOP_ARRIVE", 1, 5, Map.of("outletId", "OUT901"))));

        var noReason = action("ORDER_OUTCOME", 1, 8, Map.of("orderId", freshOrder, "outcome", "PARTIAL", "deliveredUnits", 10, "recipientName", "S. Perera"));
        var rejected = sync(List.of(noReason)).path("results").get(0);
        assertThat(rejected.path("result").asText()).isEqualTo("REJECTED");
        assertThat(rejected.path("code").asText()).isEqualTo("ISSUE_REQUIRED");
        var again = sync(List.of(noReason)).path("results").get(0);
        assertThat(again.path("result").asText()).isEqualTo("DUPLICATE");
        assertThat(again.path("code").asText()).isEqualTo("ISSUE_REQUIRED");
        assertThat(db.queryForObject("SELECT count(*) FROM delivery_record", Integer.class)).isZero();

        // Recorded online first, then the same outcome arrives from the outbox under a new id.
        long version = getJson(driver, "/api/v1/driver/trips/1").path("version").asLong();
        postJson(driver, "/api/v1/driver/trips/1/orders/" + freshOrder + "/outcome",
            Map.of("expectedVersion", version, "outcome", "DELIVERED", "recipientName", "S. Perera"), 200);
        var same = sync(List.of(action("ORDER_OUTCOME", 1, 9, Map.of("orderId", freshOrder, "outcome", "DELIVERED", "recipientName", "S. Perera"))))
            .path("results").get(0);
        assertThat(same.path("result").asText()).isEqualTo("APPLIED");
        assertThat(same.path("code").asText()).isEqualTo("ALREADY_APPLIED");
        var different = sync(List.of(action("ORDER_OUTCOME", 1, 10, Map.of("orderId", freshOrder, "outcome", "FAILED", "issueKind", "REFUSED"))))
            .path("results").get(0);
        assertThat(different.path("result").asText()).isEqualTo("CONFLICT");
        assertThat(different.path("code").asText()).isEqualTo("ORDER_ALREADY_RECORDED");
        assertThat(different.path("detail").path("recordedOutcome").asText()).isEqualTo("DELIVERED");
        assertThat(different.path("detail").path("sentOutcome").asText()).isEqualTo("FAILED");
        assertThat(db.queryForObject("SELECT outcome FROM delivery_record WHERE order_id=?", String.class, freshOrder)).isEqualTo("DELIVERED");

        // Stopping where no order of this driver ever was is rejected; a far-off device clock is flagged, not rewritten.
        var unknown = sync(List.of(action("STOP_ARRIVE", 1, 30, Map.of("outletId", "OUT903")))).path("results").get(0);
        assertThat(unknown.path("result").asText()).isIn("REJECTED", "CONFLICT");
        var skewed = new HashMap<>(action("STOP_DEPART", 1, 0, Map.of("outletId", "OUT901")));
        skewed.put("occurredAt", "2026-06-20T00:00:00Z");
        var skew = sync(List.of(skewed)).path("results").get(0);
        assertThat(skew.path("result").asText()).isEqualTo("APPLIED");
        assertThat(skew.path("clockSkew").asBoolean()).isTrue();
        assertThat(db.queryForObject("SELECT occurred_at FROM sync_command WHERE client_action_id=?::uuid", java.sql.Timestamp.class,
            skewed.get("clientActionId")).toInstant()).isEqualTo(Instant.parse("2026-06-20T00:00:00Z"));
        // Departure never precedes arrival, whatever the device clock said.
        assertThat(db.queryForObject("SELECT departed_at >= arrived_at FROM stop_visit", Boolean.class)).isTrue();

        // The same action id from another account is refused.
        var other = sync(loader, List.of(noReason), 403);
        assertThat(other.path("code").asText()).isEqualTo("FORBIDDEN");
        var invalid = postJson(driver, "/api/v1/driver/sync", Map.of("actions", List.of(Map.of("clientActionId", UUID.randomUUID().toString(),
            "actionType", "TELEPORT", "planDate", "2026-06-26", "tripIndex", 1, "occurredAt", T0.toString()))), 400);
        assertThat(invalid.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        failure(mvc.perform(post("/api/v1/driver/sync").header("X-Requested-With", "Waypoint").contentType("application/json").content("{\"actions\":[]}"))
            .andReturn(), 401, "UNAUTHENTICATED");
    }

    @Test void theDriversRecordWinsWhenTheDispatcherChangedTheTripWhileThePhoneWasOffline() throws Exception {
        db.update("""
            INSERT INTO customer_order(ref,outlet_id,brand,depot,district,order_date,planning_date,placed_at,confirmed_at,temp_requirement,units,
                                       weight_kg,volume_m3,status,iso_year,iso_week,version,updated_at)
            SELECT 'SYN003',outlet_id,brand,depot,district,order_date,planning_date,placed_at,confirmed_at,'ambient',4,40.00,0.200,'confirmed',
                   iso_year,iso_week,0,updated_at FROM customer_order WHERE ref='SYN001'
            """);
        long extra = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN003'", Long.class);
        publish(List.of(freshOrder, extra), List.of(styleOrder));
        handOver(1);

        // Offline, the driver leaves with both orders. Meanwhile the dispatcher defers SYN003 in a revision.
        long snapshot = postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
        var revision = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Revise"), 201);
        long v2 = revision.path("plan").path("id").asLong();
        long trip = db.queryForObject("SELECT id FROM trip WHERE plan_id=? AND trip_index=1", Long.class, v2);
        send(delete("/api/v1/dispatcher/plans/" + v2 + "/trips/" + trip), dispatcher, Map.of("expectedVersion", 1, "reason", "Rebuild"), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/trips", Map.of("expectedVersion", 2, "reason", "Without SYN003",
            "trip", Map.of("vehicleId", "VEH901", "tripIndex", 1, "brand", "Fresh", "district", "Alpha", "orderIds", List.of(freshOrder))), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/orders/" + extra + "/defer",
            Map.of("expectedVersion", 3, "reason", "Stock check", "reasonCode", "OTHER"), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/publish", Map.of("expectedVersion", 4, "reason", "Publish v2"), 200);

        var back = sync(List.of(
            action("TRIP_START", 1, 0, Map.of("planVersion", 1)),
            action("STOP_ARRIVE", 1, 5, Map.of("outletId", "OUT901")),
            action("ORDER_OUTCOME", 1, 8, Map.of("orderId", freshOrder, "outcome", "DELIVERED", "recipientName", "S. Perera")),
            action("ORDER_OUTCOME", 1, 9, Map.of("orderId", extra, "outcome", "DELIVERED", "recipientName", "S. Perera")),
            action("STOP_DEPART", 1, 12, Map.of("outletId", "OUT901")),
            action("TRIP_COMPLETE", 1, 40, Map.of())));
        assertThat(results(back, "result")).containsOnly("APPLIED");
        assertThat(back.path("results").get(0).path("review").asText()).isEqualTo("ROUTE_CHANGED_OFFLINE");
        assertThat(back.path("results").get(3).path("review").asText()).isEqualTo("ORDER_NOT_ON_TRIP");
        assertThat(db.queryForObject("SELECT review_reason FROM delivery_record WHERE order_id=?", String.class, extra)).isEqualTo("ORDER_NOT_ON_TRIP");
        assertThat(orderStatus(extra)).isEqualTo("delivered");
        assertThat(orderStatus(freshOrder)).isEqualTo("delivered");
        assertThat(db.queryForObject("SELECT count(*) FROM sync_command WHERE review_reason IS NOT NULL", Integer.class)).isEqualTo(2);
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

    private JsonNode sync(List<? extends Map<String, Object>> actions) throws Exception {
        return sync(driver, actions, 200);
    }

    private JsonNode sync(Cookie who, List<? extends Map<String, Object>> actions, int expected) throws Exception {
        return postJson(who, "/api/v1/driver/sync", Map.of("actions", actions), expected);
    }

    private static List<String> results(JsonNode response, String field) {
        List<String> values = new ArrayList<>();
        response.path("results").forEach(r -> values.add(r.path(field).asText()));
        return values;
    }

    private void publish(List<Long> fresh, List<Long> style) throws Exception {
        long snapshot = postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
        long plan = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "First version"), 201)
            .path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, fresh);
        addTrip(plan, 1, "Style", 2, style);
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

    private String orderStatus(long order) {
        return db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, order);
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
