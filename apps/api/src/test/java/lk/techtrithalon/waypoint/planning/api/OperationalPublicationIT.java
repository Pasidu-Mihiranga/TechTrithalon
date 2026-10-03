package lk.techtrithalon.waypoint.planning.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Publication as an operational handoff: versions, fuel, frozen schedule, drivers and load tasks. */
class OperationalPublicationIT extends ReferenceApiTestSupport {
    private Cookie dispatcher;
    private long freshOrder;
    private long styleOrder;
    private long driverId;

    @BeforeEach void setup() throws Exception {
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM sync_command"); db.update("DELETE FROM pod_asset"); db.update("DELETE FROM delivery_record"); db.update("DELETE FROM stop_visit"); db.update("DELETE FROM delivery_trip");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM fuel_ledger");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
        driverId = db.queryForObject("SELECT id FROM app_user WHERE username='DRV-001'", Long.class);
    }

    @AfterEach void restoreDriverLink() {
        db.update("UPDATE app_user SET vehicle_id='VEH901' WHERE username='DRV-001'");
        db.update("UPDATE vehicle_availability SET status='available' WHERE vehicle_id='VEH901' AND date='2026-06-26'");
    }

    @Test void publicationFreezesScheduleAssignsTheDriverAndCreatesLoadTasks() throws Exception {
        long plan = publishedFirstVersion();
        var view = read(plan);
        assertThat(view.path("plan").path("ruleVersion").asText()).isEqualTo("booklet-v1");
        assertThat(view.path("plan").path("basedOnPlanId").isNull()).isTrue();

        // Frozen rows match what the validator computed and the plan view shows.
        var computed = view.path("trips");
        var published = view.path("published");
        assertThat(published.size()).isEqualTo(2);
        for (int i = 0; i < 2; i++) {
            var trip = computed.get(i);
            var frozen = published.get(i);
            assertThat(frozen.path("tripId").asLong()).isEqualTo(trip.path("id").asLong());
            assertThat(frozen.path("tripMinutes").asInt()).isEqualTo(trip.path("tripMinutes").asInt());
            assertThat(frozen.path("fuelLitres").decimalValue()).isEqualByComparingTo(trip.path("fuelLitres").decimalValue());
            assertThat(frozen.path("distanceKm").decimalValue()).isEqualByComparingTo(trip.path("distanceKm").decimalValue());
            assertThat(frozen.path("stops").get(0).path("plannedArrival").asText())
                .isEqualTo(trip.path("stops").get(0).path("plannedArrival").asText());
            assertThat(frozen.path("driverUserId").asLong()).isEqualTo(driverId);
            assertThat(frozen.path("driverName").asText()).isNotBlank();
            assertThat(frozen.path("loadStatus").asText()).isEqualTo("pending");
        }
        assertThat(published.get(0).path("plannedDepart").asText()).isEqualTo("03:30:00");
        assertThat(db.queryForObject("SELECT count(*) FROM trip WHERE plan_id=? AND planned_depart IS NOT NULL AND driver_user_id=?",
            Integer.class, plan, driverId)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM stop WHERE plan_id=? AND planned_arrival IS NOT NULL", Integer.class, plan)).isEqualTo(2);

        // One pending load task per trip, stamped with the plan version and copied order quantities.
        assertThat(db.queryForObject("SELECT count(*) FROM load_task WHERE plan_id=? AND plan_version=1 AND status='pending'",
            Integer.class, plan)).isEqualTo(2);
        var line = db.queryForMap("""
            SELECT l.units, l.weight_kg, l.volume_m3, l.order_ref, l.stop_seq, l.load_seq, t.driver_user_id
            FROM load_line l JOIN load_task t ON t.id=l.load_task_id WHERE l.order_id=?""", freshOrder);
        var order = db.queryForMap("SELECT units, weight_kg, volume_m3, ref FROM customer_order WHERE id=?", freshOrder);
        assertThat(line.get("units")).isEqualTo(order.get("units"));
        assertThat((BigDecimal) line.get("weight_kg")).isEqualByComparingTo((BigDecimal) order.get("weight_kg"));
        assertThat((BigDecimal) line.get("volume_m3")).isEqualByComparingTo((BigDecimal) order.get("volume_m3"));
        assertThat(line.get("order_ref")).isEqualTo(order.get("ref"));
        assertThat(line.get("stop_seq")).isEqualTo(1);
        assertThat(line.get("load_seq")).isEqualTo(1);
        assertThat(((Number) line.get("driver_user_id")).longValue()).isEqualTo(driverId);

        assertThat(fuel()).isEqualByComparingTo("8.00");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='load_task.created'", Integer.class)).isEqualTo(2);

        var changes = getJson("/api/v1/dispatcher/plans/" + plan + "/changes");
        assertThat(changes.path("firstVersion").asBoolean()).isTrue();
        assertThat(changes.path("summary").path("added").asInt()).isEqualTo(2);
        assertThat(changes.path("summary").path("tripsAdded").asInt()).isEqualTo(2);
    }

    @Test void republishSupersedesTheCurrentVersionAndCountsFuelOnce() throws Exception {
        long v1 = publishedFirstVersion();
        long fuelEvents = db.queryForObject("SELECT count(*) FROM audit_event WHERE type='vehicle.fuel.reserved'", Long.class);

        // A revision snapshot covers the whole run, including orders version 1 planned.
        long snapshot = snapshot();
        assertThat(db.queryForObject("SELECT cardinality(order_ids) FROM planning_snapshot WHERE id=?", Integer.class, snapshot)).isEqualTo(2);
        var revision = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Revise after a call"), 201);
        long v2 = revision.path("plan").path("id").asLong();
        assertThat(revision.path("plan").path("basedOnPlanId").asLong()).isEqualTo(v1);
        assertThat(revision.path("plan").path("version").asInt()).isEqualTo(2);
        assertThat(revision.path("plan").path("trips").size()).isEqualTo(2);
        assertThat(revision.path("unassignedOrders").size()).isZero();
        // Copied trips are validated against version 1's reservation being replaced, not added to.
        assertThat(revision.path("validation").path("feasible").asBoolean()).isTrue();
        assertThat(revision.path("vehicleUtilisation").path("VEH901").path("fuelCommittedBeforeL").decimalValue()).isEqualByComparingTo("0");

        long styleTrip = tripFor(revision, styleOrder);
        int version = revision.path("plan").path("lockVersion").asInt();
        postJson("/api/v1/dispatcher/plans/" + v2 + "/trips/" + styleTrip,
            Map.of("expectedVersion", version, "reason", "Style van slot no longer needed"), 200, true);
        postJson("/api/v1/dispatcher/plans/" + v2 + "/orders/" + styleOrder + "/defer",
            Map.of("expectedVersion", version + 1, "reason", "Outlet closed for stocktake", "reasonCode", "OTHER"), 200);

        var diff = getJson("/api/v1/dispatcher/plans/" + v2 + "/changes");
        assertThat(diff.path("basePlanId").asLong()).isEqualTo(v1);
        assertThat(diff.path("summary").path("removed").asInt()).isEqualTo(1);
        assertThat(diff.path("summary").path("unchanged").asInt()).isEqualTo(1);
        assertThat(diff.path("summary").path("tripsRemoved").asInt()).isEqualTo(1);

        var published = postJson("/api/v1/dispatcher/plans/" + v2 + "/publish",
            Map.of("expectedVersion", version + 2, "reason", "Publish revision"), 200);
        assertThat(published.path("plan").path("status").asText()).isEqualTo("published");
        assertThat(published.path("published").size()).isEqualTo(1);

        var old = read(v1);
        assertThat(old.path("plan").path("status").asText()).isEqualTo("superseded");
        assertThat(old.path("plan").path("supersededByPlanId").asLong()).isEqualTo(v2);
        assertThat(old.path("plan").path("supersededAt").isNull()).isFalse();
        assertThat(db.queryForObject("SELECT count(*) FROM plan WHERE plan_date='2026-06-26' AND depot='Peliyagoda' AND status='published'",
            Integer.class)).isEqualTo(1);

        // Fuel: version 1's 8 L is returned and version 2's 4 L reserved, so the ledger holds 4 L, not 12 L.
        assertThat(fuel()).isEqualByComparingTo("4.00");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='vehicle.fuel.released'", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='vehicle.fuel.reserved'", Long.class)).isEqualTo(fuelEvents + 1);

        // The dock's old manifest is superseded; the new version has its own task.
        assertThat(db.queryForObject("SELECT count(*) FROM load_task WHERE plan_id=? AND status='superseded'", Integer.class, v1)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM load_task WHERE plan_id=? AND plan_version=2 AND status='pending'", Integer.class, v2)).isEqualTo(1);

        // The removed order is deferred to the next run; the kept order stays planned without a new transition.
        var style = db.queryForMap("SELECT status, planning_date FROM customer_order WHERE id=?", styleOrder);
        assertThat(style.get("status")).isEqualTo("deferred");
        assertThat(style.get("planning_date").toString()).isEqualTo("2026-06-27");
        assertThat(db.queryForObject("SELECT plan_id FROM deferral WHERE order_id=?", Long.class, styleOrder)).isEqualTo(v2);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='order.planned' AND entity_id=?",
            Integer.class, String.valueOf(freshOrder))).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='plan.superseded' AND entity_id=?",
            Integer.class, String.valueOf(v1))).isEqualTo(1);
    }

    @Test void aRevisionBasedOnAReplacedVersionCannotPublish() throws Exception {
        long v1 = publishedFirstVersion();
        long snapshot = snapshot();
        long first = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Revision A"), 201).path("plan").path("id").asLong();
        var second = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Revision B"), 201);
        long b = second.path("plan").path("id").asLong();
        postJson("/api/v1/dispatcher/plans/" + first + "/publish", Map.of("expectedVersion", 1, "reason", "Publish A"), 200);
        // Revision B still copies version 1, which is no longer current.
        var stale = postJson("/api/v1/dispatcher/plans/" + b + "/publish", Map.of("expectedVersion", 1, "reason", "Publish B"), 409);
        assertThat(stale.path("code").asText()).isEqualTo("STALE_BASE");
        assertThat(stale.path("detail").asText()).contains("Version 2");
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?", String.class, b)).isEqualTo("candidate");
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?", String.class, v1)).isEqualTo("superseded");
        assertThat(fuel()).isEqualByComparingTo("8.00");
        assertThat(db.queryForObject("SELECT count(*) FROM load_task WHERE plan_id=?", Integer.class, b)).isZero();
    }

    @Test void concurrentPublicationsOfOneRunLetExactlyOneWin() throws Exception {
        long snapshot = snapshot();
        List<Long> candidates = new ArrayList<>();
        for (String name : List.of("A", "B")) {
            long plan = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Candidate " + name), 201).path("plan").path("id").asLong();
            addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
            addTrip(plan, 1, "Style", 2, List.of(styleOrder));
            candidates.add(plan);
        }
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        List<Callable<Integer>> calls = candidates.stream().<Callable<Integer>>map(plan -> () -> {
            start.await();
            return mvc.perform(post("/api/v1/dispatcher/plans/" + plan + "/publish").cookie(dispatcher).header("X-Requested-With", "Waypoint")
                .contentType("application/json").content(mapper.writeValueAsString(Map.of("expectedVersion", 2, "reason", "Race"))))
                .andReturn().getResponse().getStatus();
        }).toList();
        var futures = calls.stream().map(pool::submit).toList();
        start.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (var f : futures) statuses.add(f.get());
        pool.shutdown();
        assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        assertThat(db.queryForObject("SELECT count(*) FROM plan WHERE status='published'", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM load_task", Integer.class)).isEqualTo(2);
        assertThat(fuel()).isEqualByComparingTo("8.00");
    }

    @Test void aRevisionWhoseCopiedTripsBreakARuleCanStartEmpty() throws Exception {
        long v1 = publishedFirstVersion();
        assertThat(db.update("UPDATE vehicle_availability SET status='in_workshop' WHERE vehicle_id='VEH901' AND date='2026-06-26'")).isEqualTo(1);
        long snapshot = snapshot();
        var rejected = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Copy broken vehicle"), 422);
        assertThat(rejected.path("code").asText()).isEqualTo("REVISION_COPY_INFEASIBLE");
        assertThat(rejected.path("violations").size()).isPositive();
        assertThat(db.queryForObject("SELECT count(*) FROM plan WHERE status='candidate'", Integer.class)).isZero();
        var empty = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Start again", "startFrom", "empty"), 201);
        assertThat(empty.path("plan").path("basedOnPlanId").asLong()).isEqualTo(v1);
        assertThat(empty.path("plan").path("trips").size()).isZero();
        assertThat(empty.path("unassignedOrders").size()).isEqualTo(2);
    }

    @Test void aVehicleWithoutALinkedDriverPublishesWithoutOneAndEmptyTripsAreRefused() throws Exception {
        db.update("UPDATE app_user SET vehicle_id=NULL WHERE username='DRV-001'");
        long snapshot = snapshot();
        long plan = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "No driver"), 201).path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
        var withEmpty = addTrip(plan, 1, "Style", 2, List.of(styleOrder));
        long styleTrip = tripFor(withEmpty, styleOrder);
        postJson("/api/v1/dispatcher/plans/" + plan + "/moves",
            Map.of("expectedVersion", 2, "reason", "Move to the first trip slot", "orderId", styleOrder, "fromTripId", styleTrip), 200);
        postJson("/api/v1/dispatcher/plans/" + plan + "/orders/" + styleOrder + "/defer",
            Map.of("expectedVersion", 3, "reason", "Defer style", "reasonCode", "CAPACITY"), 200);
        var empty = postJson("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 4, "reason", "Has empty trip"), 422);
        assertThat(empty.path("code").asText()).isEqualTo("EMPTY_TRIP");
        postJson("/api/v1/dispatcher/plans/" + plan + "/trips/" + styleTrip, Map.of("expectedVersion", 4, "reason", "Remove empty trip"), 200, true);
        var published = postJson("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 5, "reason", "Publish"), 200);
        assertThat(published.path("published").get(0).path("driverUserId").isNull()).isTrue();
        assertThat(db.queryForObject("SELECT count(*) FROM load_task WHERE driver_user_id IS NULL", Integer.class)).isEqualTo(1);
    }

    @Test void versionChangesAreDispatcherOnlyAndScoped() throws Exception {
        long plan = publishedFirstVersion();
        failure(mvc.perform(get("/api/v1/dispatcher/plans/" + plan + "/changes")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/dispatcher/plans/" + plan + "/changes").cookie(login("STM-001", "synthetic-store-password"))).andReturn(),
            403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/dispatcher/plans/999999999/changes").cookie(dispatcher)).andReturn(), 404, "NOT_FOUND");
        var invalid = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot(), "reason", "Bad option", "startFrom", "latest"), 400);
        assertThat(invalid.path("code").asText()).isEqualTo("VALIDATION_FAILED");
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        var kandy = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(get("/api/v1/dispatcher/plans/" + plan + "/changes").cookie(kandy)).andReturn(), 404, "NOT_FOUND");
    }

    private long publishedFirstVersion() throws Exception {
        long plan = postJson("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot(), "reason", "First version"), 201).path("plan").path("id").asLong();
        addTrip(plan, 0, "Fresh", 1, List.of(freshOrder));
        addTrip(plan, 1, "Style", 2, List.of(styleOrder));
        postJson("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Publish first version"), 200);
        return plan;
    }

    private long snapshot() throws Exception {
        return postJson("/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201).path("id").asLong();
    }

    private JsonNode addTrip(long plan, int version, String brand, int slot, List<Long> orders) throws Exception {
        Map<String, Object> trip = new HashMap<>(Map.of("vehicleId", "VEH901", "tripIndex", slot, "brand", brand, "district", "Alpha", "orderIds", orders));
        return postJson("/api/v1/dispatcher/plans/" + plan + "/trips", Map.of("expectedVersion", version, "reason", "Assign", "trip", trip), 200);
    }

    private static long tripFor(JsonNode view, long orderId) {
        for (var trip : view.path("plan").path("trips"))
            for (var id : trip.path("orderIds")) if (id.asLong() == orderId) return trip.path("id").asLong();
        throw new AssertionError("order " + orderId + " is on no trip");
    }

    private BigDecimal fuel() {
        return db.queryForObject("SELECT litres_committed FROM fuel_ledger WHERE vehicle_id='VEH901'", BigDecimal.class);
    }

    private JsonNode read(long id) throws Exception { return getJson("/api/v1/dispatcher/plans/" + id); }

    private JsonNode getJson(String path) throws Exception {
        return mapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path).cookie(dispatcher))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private JsonNode postJson(String path, Object body, int expected) throws Exception { return postJson(path, body, expected, false); }

    private JsonNode postJson(String path, Object body, int expected, boolean delete) throws Exception {
        var builder = delete ? org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(path) : post(path);
        var response = mvc.perform(builder.cookie(dispatcher).header("X-Requested-With", "Waypoint")
            .contentType("application/json").content(mapper.writeValueAsString(body))).andExpect(status().is(expected)).andReturn();
        if (expected >= 400) failure(response, expected, mapper.readTree(response.getResponse().getContentAsString()).path("code").asText());
        return mapper.readTree(response.getResponse().getContentAsString());
    }
}
