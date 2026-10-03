package lk.techtrithalon.waypoint.loading.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The dock's workflow on published manifests: count, shortfall, hold, republish and handover. */
class LoaderWorkflowIT extends ReferenceApiTestSupport {
    private Cookie dispatcher;
    private Cookie loader;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM pod_asset"); db.update("DELETE FROM delivery_record"); db.update("DELETE FROM stop_visit"); db.update("DELETE FROM delivery_trip");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM fuel_ledger");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='LDR-001'");
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        loader = login("LDR-001", "synthetic-loader-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    @AfterEach void restore() {
        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='LDR-001'");
    }

    @Test void theBoardShowsPublishedTripsInDepartureOrderWithCountsFromTheManifest() throws Exception {
        long plan = publishFirstVersion();
        var board = getJson(loader, "/api/v1/loader/board?date=2026-06-26");
        assertThat(board.path("planVersion").asInt()).isEqualTo(1);
        assertThat(board.path("summary").path("tripsAssigned").asInt()).isEqualTo(2);
        assertThat(board.path("summary").path("ordersToLoad").asInt()).isEqualTo(2);
        assertThat(board.path("summary").path("ordersLoaded").asInt()).isZero();
        var first = board.path("trips").get(0);
        assertThat(first.path("plannedDepart").asText()).isEqualTo("03:30:00");
        assertThat(first.path("volumeCapM3").decimalValue()).isEqualByComparingTo("25.0");
        assertThat(first.path("weightCapKg").decimalValue()).isEqualByComparingTo("5000");
        assertThat(first.path("volumeM3").decimalValue()).isEqualByComparingTo("1.250");
        assertThat(first.path("driverName").asText()).isNotBlank();
        assertThat(board.path("nextDeparture").path("loadTaskId").asLong()).isEqualTo(first.path("loadTaskId").asLong());
        // Default date is the demo operating day.
        assertThat(getJson(loader, "/api/v1/loader/board").path("planDate").asText()).isEqualTo("2026-06-26");

        var detail = getJson(loader, "/api/v1/loader/load-tasks/" + first.path("loadTaskId").asLong());
        assertThat(detail.path("stops").size()).isEqualTo(1);
        assertThat(detail.path("stops").get(0).path("loadPosition").asInt()).isEqualTo(1);
        assertThat(detail.path("stops").get(0).path("lines").get(0).path("units").asInt()).isEqualTo(12);
        assertThat(detail.path("handoverBlockers").get(0).asText()).contains("not counted");
        assertThat(detail.path("task").path("planId").asLong()).isEqualTo(plan);
    }

    @Test void countingEveryOrderLetsTheTripBeHandedOver() throws Exception {
        publishFirstVersion();
        long task = taskFor(1);
        var detail = getJson(loader, "/api/v1/loader/load-tasks/" + task);
        long line = detail.path("task").path("lines").get(0).path("id").asLong();
        var stale = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/loaded", Map.of("expectedVersion", 5), 409);
        assertThat(stale.path("code").asText()).isEqualTo("STALE_LOAD_TASK");
        var counted = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/loaded", Map.of("expectedVersion", 0), 200);
        assertThat(counted.path("task").path("status").asText()).isEqualTo("loading");
        assertThat(counted.path("task").path("lines").get(0).path("loadedUnits").asInt()).isEqualTo(12);
        assertThat(counted.path("handoverBlockers").size()).isZero();
        var twice = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/loaded", Map.of("expectedVersion", 1), 409);
        assertThat(twice.path("code").asText()).isEqualTo("LINE_ALREADY_COUNTED");
        var loaded = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/loaded", Map.of("expectedVersion", 1), 200);
        assertThat(loaded.path("task").path("status").asText()).isEqualTo("loaded");
        assertThat(loaded.path("task").path("loadedAt").isNull()).isFalse();
        var again = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/loaded", Map.of("expectedVersion", 2), 409);
        assertThat(again.path("code").asText()).isEqualTo("TRIP_ALREADY_LOADED");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('load_line.loaded','load_task.loaded') AND actor_id IS NOT NULL",
            Integer.class)).isEqualTo(2);
        var board = getJson(loader, "/api/v1/loader/board?date=2026-06-26");
        assertThat(board.path("summary").path("ordersLoaded").asInt()).isEqualTo(1);
        assertThat(board.path("nextDeparture").path("tripIndex").asInt()).isEqualTo(2);
    }

    @Test void aShortfallThatHoldsTheVehicleBlocksHandoverUntilTheDispatcherDecides() throws Exception {
        long plan = publishFirstVersion();
        long task = taskFor(1);
        long line = getJson(loader, "/api/v1/loader/load-tasks/" + task).path("task").path("lines").get(0).path("id").asLong();
        var tooMany = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/shortfall",
            Map.of("expectedVersion", 0, "kind", "MISSING", "shortUnits", 13, "holdsVehicle", true), 422);
        assertThat(tooMany.path("code").asText()).isEqualTo("SHORT_UNITS_INVALID");
        var reported = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/shortfall",
            Map.of("expectedVersion", 0, "kind", "MISSING", "shortUnits", 2, "note", "Two crates not on the dock", "holdsVehicle", true), 200);
        var counted = reported.path("task").path("lines").get(0);
        assertThat(counted.path("status").asText()).isEqualTo("short");
        assertThat(counted.path("loadedUnits").asInt()).isEqualTo(10);
        assertThat(reported.path("card").path("held").asBoolean()).isTrue();
        assertThat(reported.path("issues").get(0).path("status").asText()).isEqualTo("OPEN");
        var duplicate = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/shortfall",
            Map.of("expectedVersion", 1, "kind", "DAMAGED", "shortUnits", 1, "holdsVehicle", false), 409);
        assertThat(duplicate.path("code").asText()).isEqualTo("ISSUE_ALREADY_OPEN");

        var blocked = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/loaded", Map.of("expectedVersion", 1), 409);
        assertThat(blocked.path("code").asText()).isEqualTo("HANDOVER_BLOCKED");
        assertThat(blocked.path("blockers").get(0).asText()).contains("held");

        // The dispatcher sees the shortfall before departure, also on the published plan.
        var issues = getJson(dispatcher, "/api/v1/dispatcher/loading-issues?date=2026-06-26&depot=Peliyagoda&status=OPEN");
        assertThat(issues.size()).isEqualTo(1);
        assertThat(issues.get(0).path("shortUnits").asInt()).isEqualTo(2);
        var publishedTrip = getJson(dispatcher, "/api/v1/dispatcher/plans/" + plan).path("published").get(0);
        assertThat(publishedTrip.path("held").asBoolean()).isTrue();
        assertThat(publishedTrip.path("openLoadingIssues").asInt()).isEqualTo(1);
        long issue = issues.get(0).path("id").asLong();
        var badDecision = postJson(dispatcher, "/api/v1/dispatcher/loading-issues/" + issue + "/resolve",
            Map.of("expectedVersion", 0, "decision", "IGNORE", "note", "x"), 400);
        assertThat(badDecision.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        var resolved = postJson(dispatcher, "/api/v1/dispatcher/loading-issues/" + issue + "/resolve",
            Map.of("expectedVersion", 0, "decision", "SEND_SHORT", "note", "Send 10; store informed on receipt"), 200);
        assertThat(resolved.path("status").asText()).isEqualTo("RESOLVED");
        assertThat(resolved.path("resolvedByName").asText()).isNotBlank();
        var twice = postJson(dispatcher, "/api/v1/dispatcher/loading-issues/" + issue + "/resolve",
            Map.of("expectedVersion", 1, "decision", "SEND_SHORT", "note", "again"), 409);
        assertThat(twice.path("code").asText()).isEqualTo("ISSUE_RESOLVED");

        var loaded = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/loaded", Map.of("expectedVersion", 1), 200);
        assertThat(loaded.path("task").path("status").asText()).isEqualTo("loaded");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('loading_issue.reported','loading_issue.resolved')",
            Integer.class)).isEqualTo(2);
    }

    @Test void aRepublishMidLoadKeepsCountsMovesOpenIssuesAndNeedsAcknowledgement() throws Exception {
        long v1 = publishFirstVersion();
        long oldTask = taskFor(1);
        long styleTask = taskFor(2);
        long line = getJson(loader, "/api/v1/loader/load-tasks/" + oldTask).path("task").path("lines").get(0).path("id").asLong();
        postJson(loader, "/api/v1/loader/load-tasks/" + oldTask + "/lines/" + line + "/shortfall",
            Map.of("expectedVersion", 0, "kind", "DAMAGED", "shortUnits", 1, "holdsVehicle", false), 200);

        // The dispatcher revises: the Style trip is dropped and its order deferred.
        long snapshot = postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
        var revision = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Revise mid-load"), 201);
        long v2 = revision.path("plan").path("id").asLong();
        long styleTrip = 0;
        for (var t : revision.path("plan").path("trips")) if (t.path("tripIndex").asInt() == 2) styleTrip = t.path("id").asLong();
        send(delete("/api/v1/dispatcher/plans/" + v2 + "/trips/" + styleTrip), dispatcher, Map.of("expectedVersion", 1, "reason", "Drop style trip"), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/orders/" + styleOrder + "/defer",
            Map.of("expectedVersion", 2, "reason", "Stocktake", "reasonCode", "OTHER"), 200);
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + v2 + "/publish", Map.of("expectedVersion", 3, "reason", "Publish revision"), 200);

        // The old manifest is refused and points to the current one.
        var refused = postJson(loader, "/api/v1/loader/load-tasks/" + oldTask + "/loaded", Map.of("expectedVersion", 1), 409);
        assertThat(refused.path("code").asText()).isEqualTo("MANIFEST_SUPERSEDED");
        long newTask = refused.path("currentTaskId").asLong();
        assertThat(getJson(loader, "/api/v1/loader/load-tasks/" + oldTask).path("currentTaskId").asLong()).isEqualTo(newTask);
        assertThat(getJson(loader, "/api/v1/loader/load-tasks/" + styleTask).path("currentTaskId").isNull()).isTrue();

        var current = getJson(loader, "/api/v1/loader/load-tasks/" + newTask);
        assertThat(current.path("task").path("planVersion").asInt()).isEqualTo(2);
        assertThat(current.path("replacedPlanVersion").asInt()).isEqualTo(1);
        assertThat(current.path("task").path("acknowledgementRequired").asBoolean()).isTrue();
        assertThat(current.path("task").path("status").asText()).isEqualTo("loading");
        var carried = current.path("task").path("lines").get(0);
        assertThat(carried.path("carried").asBoolean()).isTrue();
        assertThat(carried.path("loadedUnits").asInt()).isEqualTo(11);
        assertThat(current.path("issues").get(0).path("status").asText()).isEqualTo("OPEN");
        assertThat(current.path("issues").get(0).path("loadTaskId").asLong()).isEqualTo(newTask);
        assertThat(current.path("handoverBlockers").get(0).asText()).contains("Acknowledge manifest v2");
        var board = getJson(loader, "/api/v1/loader/board?date=2026-06-26");
        assertThat(board.path("planVersion").asInt()).isEqualTo(2);
        assertThat(board.path("summary").path("tripsAssigned").asInt()).isEqualTo(1);
        assertThat(board.path("trips").get(0).path("awaitingAcknowledgement").asBoolean()).isTrue();

        var notYet = postJson(loader, "/api/v1/loader/load-tasks/" + newTask + "/loaded", Map.of("expectedVersion", 0), 409);
        assertThat(notYet.path("code").asText()).isEqualTo("HANDOVER_BLOCKED");
        var acknowledged = postJson(loader, "/api/v1/loader/load-tasks/" + newTask + "/acknowledge", Map.of("expectedVersion", 0), 200);
        assertThat(acknowledged.path("task").path("acknowledgedAt").isNull()).isFalse();
        var loaded = postJson(loader, "/api/v1/loader/load-tasks/" + newTask + "/loaded", Map.of("expectedVersion", 1), 200);
        assertThat(loaded.path("task").path("status").asText()).isEqualTo("loaded");
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?", String.class, v1)).isEqualTo("superseded");
    }

    @Test void loaderEndpointsAreScopedToTheLoadersDepotAndRole() throws Exception {
        publishFirstVersion();
        long task = taskFor(1);
        failure(mvc.perform(get("/api/v1/loader/board")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/loader/board").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/loader/board").cookie(login("DRV-001", "synthetic-driver-password"))).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/dispatcher/loading-issues?date=2026-06-26&depot=Peliyagoda").cookie(loader)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/loader/load-tasks/999999999").cookie(loader)).andReturn(), 404, "NOT_FOUND");
        long line = getJson(loader, "/api/v1/loader/load-tasks/" + task).path("task").path("lines").get(0).path("id").asLong();
        var badKind = postJson(loader, "/api/v1/loader/load-tasks/" + task + "/lines/" + line + "/shortfall",
            Map.of("expectedVersion", 0, "kind", "LOST", "shortUnits", 1, "holdsVehicle", false), 400);
        assertThat(badKind.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='LDR-001'");
        var kandy = login("LDR-001", "synthetic-loader-password");
        failure(mvc.perform(get("/api/v1/loader/load-tasks/" + task).cookie(kandy)).andReturn(), 404, "NOT_FOUND");
        assertThat(getJson(kandy, "/api/v1/loader/board?date=2026-06-26").path("trips").size()).isZero();
    }

    private long publishFirstVersion() throws Exception {
        long snapshot = postJson(dispatcher, "/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
        long plan = postJson(dispatcher, "/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "First version"), 201)
            .path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
        addTrip(plan, 1, "Style", 2, List.of(styleOrder));
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Publish"), 200);
        return plan;
    }

    private void addTrip(long plan, int version, String brand, int slot, List<Long> orders) throws Exception {
        Map<String, Object> trip = new HashMap<>(Map.of("vehicleId", "VEH901", "tripIndex", slot, "brand", brand, "district", "Alpha", "orderIds", orders));
        postJson(dispatcher, "/api/v1/dispatcher/plans/" + plan + "/trips", Map.of("expectedVersion", version, "reason", "Assign", "trip", trip), 200);
    }

    private long taskFor(int tripIndex) {
        return db.queryForObject("SELECT id FROM load_task WHERE trip_index=? AND status<>'superseded'", Long.class, tripIndex);
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
