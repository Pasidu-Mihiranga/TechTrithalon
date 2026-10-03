package lk.techtrithalon.waypoint.delivery.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Live Operations: the dispatcher's board follows each published trip from the dock to the last stop. */
class LiveOperationsIT extends ReferenceApiTestSupport {
    private static final String BOARD = "/api/v1/dispatcher/live-operations?date=2026-06-26&depot=Peliyagoda";
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

    @Test void aTripMovesAcrossTheBoardAsTheDockAndTheDriverAct() throws Exception {
        assertThat(getJson(dispatcher, BOARD).path("vehicles").size()).isZero();            // nothing published yet
        publish();

        var loading = getJson(dispatcher, BOARD);
        assertThat(loading.path("vehicles").size()).isEqualTo(2);
        assertThat(loading.path("counts").path("loading").asInt()).isEqualTo(2);
        var first = vehicle(loading, 1);
        assertThat(first.path("vehicleId").asText()).isEqualTo("VEH901");
        assertThat(first.path("driverName").asText()).isNotBlank();
        assertThat(first.path("state").asText()).isEqualTo("LOADING");
        assertThat(first.path("orders").asInt()).isEqualTo(1);
        assertThat(first.path("ordersDone").asInt()).isZero();
        assertThat(first.path("stopMarks").size()).isEqualTo(1);
        assertThat(first.path("currentStopSeq").isNull()).isTrue();                          // not on the road yet

        handOver(1);
        var ready = getJson(dispatcher, BOARD);
        assertThat(vehicle(ready, 1).path("state").asText()).isEqualTo("READY");
        assertThat(ready.path("counts").path("ready").asInt()).isEqualTo(1);
        assertThat(ready.path("counts").path("loading").asInt()).isEqualTo(1);

        postJson(driver, "/api/v1/driver/trips/1/start", Map.of("planVersion", 1), 200);
        var road = getJson(dispatcher, BOARD);
        var moving = vehicle(road, 1);
        assertThat(moving.path("state").asText()).isIn("IN_TRANSIT", "DELAYED");
        assertThat(moving.path("currentStopSeq").asInt()).isEqualTo(1);
        assertThat(moving.path("currentOutletId").asText()).isEqualTo("OUT901");
        assertThat(moving.path("currentStopState").asText()).isEqualTo("EN_ROUTE");
        assertThat(moving.path("currentEta").asText()).isNotBlank();
        assertThat(road.path("counts").path("inTransit").asInt() + road.path("counts").path("delayed").asInt()).isEqualTo(1);
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/dashboard?date=2026-06-26&depot=Peliyagoda").path("activeTrips").path("value").asInt()).isEqualTo(1);

        long version = getJson(driver, "/api/v1/driver/trips/1").path("version").asLong();
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/arrive", Map.of("expectedVersion", version), 200);
        assertThat(vehicle(getJson(dispatcher, BOARD), 1).path("currentStopState").asText()).isEqualTo("ARRIVED");
        postJson(driver, "/api/v1/driver/trips/1/orders/" + freshOrder + "/outcome",
            Map.of("expectedVersion", version + 1, "outcome", "DELIVERED", "recipientName", "S. Perera"), 200);
        postJson(driver, "/api/v1/driver/trips/1/stops/OUT901/depart", Map.of("expectedVersion", version + 2), 200);
        var served = vehicle(getJson(dispatcher, BOARD), 1);
        assertThat(served.path("ordersDone").asInt()).isEqualTo(1);
        assertThat(served.path("stopsDone").asInt()).isEqualTo(1);
        assertThat(served.path("issues").asInt()).isZero();
        assertThat(served.path("stopMarks").get(0).path("status").asText()).isEqualTo("COMPLETED");

        postJson(driver, "/api/v1/driver/trips/1/complete", Map.of("expectedVersion", version + 3), 200);
        var finished = getJson(dispatcher, BOARD);
        assertThat(vehicle(finished, 1).path("state").asText()).isEqualTo("COMPLETED");
        assertThat(vehicle(finished, 1).path("currentStopSeq").isNull()).isTrue();
        assertThat(vehicle(finished, 1).path("minutesAgo").asLong()).isGreaterThanOrEqualTo(0);
        assertThat(finished.path("counts").path("completed").asInt()).isEqualTo(1);
        assertThat(finished.path("asOf").asText()).isNotBlank();

        // Scope and roles.
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/live-operations?date=2026-06-26&depot=Kandy").path("vehicles").size()).isZero();
        failure(mvc.perform(get("/api/v1/dispatcher/live-operations?date=2026-06-26").cookie(dispatcher)).andReturn(), 400, "DEPOT_REQUIRED");
        failure(mvc.perform(get(BOARD)).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get(BOARD).cookie(driver)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get(BOARD).cookie(loader)).andReturn(), 403, "FORBIDDEN");
    }

    @Test void aTripStartedFarTooLateIsMarkedDelayedWithItsLateStop() throws Exception {
        publish(); handOver(1);
        // Started 17:30 Colombo: the projected arrival is long after the store's window (device time is kept as sent).
        var start = new LinkedHashMap<String, Object>();
        start.put("clientActionId", UUID.randomUUID().toString());
        start.put("actionType", "TRIP_START"); start.put("planDate", "2026-06-26"); start.put("tripIndex", 1);
        start.put("occurredAt", "2026-06-26T12:00:00Z");
        var result = postJson(driver, "/api/v1/driver/sync", Map.of("actions", List.of(start)), 200).path("results").get(0);
        assertThat(result.path("result").asText()).isEqualTo("APPLIED");
        var board = getJson(dispatcher, BOARD);
        var late = vehicle(board, 1);
        assertThat(late.path("state").asText()).isEqualTo("DELAYED");
        assertThat(late.path("stopMarks").get(0).path("late").asBoolean()).isTrue();
        assertThat(board.path("counts").path("delayed").asInt()).isEqualTo(1);
        assertThat(getJson(dispatcher, "/api/v1/dispatcher/dashboard?date=2026-06-26&depot=Peliyagoda").path("activeTrips").path("value").asInt()).isEqualTo(1);
    }

    private static JsonNode vehicle(JsonNode board, int tripIndex) {
        for (var v : board.path("vehicles")) if (v.path("tripIndex").asInt() == tripIndex) return v;
        throw new AssertionError("no trip " + tripIndex);
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
