package lk.techtrithalon.waypoint.planning.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Durable deferral history, carry-forward across two operating days, fairness evidence and store notices. */
@org.springframework.context.annotation.Import(PlanningSnapshotIT.ClockConfig.class)
class DeferralIT extends ReferenceApiTestSupport {
    @Autowired PlanningSnapshotIT.SnapshotClock clock;
    private Cookie dispatcher;
    private long freshOrder;
    private long styleOrder;

    @BeforeEach void setup() throws Exception {
        clock.current = Instant.parse("2026-06-25T11:00:00Z");
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM fuel_ledger");
        db.update("DELETE FROM audit_event");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date,source_deferred_yesterday=false WHERE ref IN ('SYN001','SYN002')");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        freshOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        styleOrder = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
    }

    @Test void deferralsPersistCarryForwardAndCountConsecutiveOperatingDays() throws Exception {
        // The imported scenario says the Style outlet was also skipped the day before its requested date.
        db.update("UPDATE customer_order SET source_deferred_yesterday=true WHERE id=?", styleOrder);
        // Day one: both orders are deferred and published.
        long dayOne = candidate("2026-06-26");
        defer(dayOne, 0, freshOrder, "CAPACITY", true, true, null);
        defer(dayOne, 1, styleOrder, "WINDOW_CONFLICT", false, false, null);
        var published = post("/api/v1/dispatcher/plans/" + dayOne + "/publish", Map.of("expectedVersion", 2, "reason", "Synthetic day one"), 200, dispatcher);
        assertThat(published.path("plan").path("status").asText()).isEqualTo("published");

        assertThat(db.queryForObject("SELECT count(*) FROM deferral WHERE plan_id=?", Integer.class, dayOne)).isEqualTo(2);
        var first = db.queryForMap("SELECT * FROM deferral WHERE order_id=?", freshOrder);
        assertThat(first.get("next_planning_date").toString()).isEqualTo("2026-06-27");
        assertThat(first.get("consecutive_deferrals")).isEqualTo(1);
        assertThat(first.get("rule_code")).isEqualTo("TRIP_CAPACITY");
        assertThat(first.get("decided_by_name")).isNotNull();
        assertThat(db.queryForObject("SELECT status FROM customer_order WHERE id=?", String.class, freshOrder)).isEqualTo("deferred");
        assertThat(db.queryForObject("SELECT planning_date FROM customer_order WHERE id=?", LocalDate.class, freshOrder))
            .isEqualTo(LocalDate.parse("2026-06-27"));
        assertThat(db.queryForObject("SELECT order_date FROM customer_order WHERE id=?", LocalDate.class, freshOrder))
            .isEqualTo(LocalDate.parse("2026-06-26"));
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type IN ('order.deferred','deferral.recorded')", Integer.class)).isEqualTo(4);

        var run = get("/api/v1/dispatcher/deferrals?date=2026-06-26&depot=Peliyagoda", dispatcher);
        assertThat(run.path("deferredOrders").asInt()).isEqualTo(2);
        assertThat(run.path("protectedNextRun").asInt()).isEqualTo(1);
        assertThat(run.path("storesNotified").asInt()).isEqualTo(1);
        assertThat(run.path("items").get(0).path("currentOrderStatus").asText()).isEqualTo("deferred");

        // The next run's queue includes both carried orders.
        var queue = get("/api/v1/dispatcher/orders?date=2026-06-27&depot=Peliyagoda&status=confirmed,deferred", dispatcher);
        assertThat(queue.path("total").asInt()).isEqualTo(2);

        // Day two: the carried order is protected and flagged as a repeat skip; deferring again counts two days.
        clock.current = Instant.parse("2026-06-26T11:00:00Z");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password"); // the day-one session has expired
        long dayTwo = candidate("2026-06-27");
        var view = get("/api/v1/dispatcher/plans/" + dayTwo, dispatcher);
        var fairness = view.path("fairness").path(String.valueOf(freshOrder));
        assertThat(fairness.path("carriedForward").asBoolean()).isTrue();
        assertThat(fairness.path("protectedThisRun").asBoolean()).isTrue();
        assertThat(fairness.path("deferredPreviousOperatingDay").asBoolean()).isTrue();
        assertThat(fairness.path("priorConsecutiveDeferrals").asInt()).isEqualTo(1);
        assertThat(fairness.path("evidenceSource").asText()).isEqualTo("history");
        var style = view.path("fairness").path(String.valueOf(styleOrder));
        assertThat(style.path("protectedThisRun").asBoolean()).isFalse();
        // History (26 June) plus the imported skip (25 June): two consecutive operating days.
        assertThat(style.path("priorConsecutiveDeferrals").asInt()).isEqualTo(2);
        assertThat(style.path("evidenceSource").asText()).isEqualTo("history+source");

        defer(dayTwo, 0, freshOrder, "OTHER", true, true, null);
        defer(dayTwo, 1, styleOrder, "CAPACITY", true, false, null);
        post("/api/v1/dispatcher/plans/" + dayTwo + "/publish", Map.of("expectedVersion", 2, "reason", "Synthetic day two"), 200, dispatcher);
        var second = db.queryForMap("SELECT * FROM deferral WHERE order_id=? AND plan_id=?", freshOrder, dayTwo);
        assertThat(second.get("consecutive_deferrals")).isEqualTo(2);
        // Sunday 28 June is not an operating day, so the next run is Monday 29 June.
        assertThat(second.get("next_planning_date").toString()).isEqualTo("2026-06-29");
        assertThat(db.queryForObject("SELECT count(*) FROM deferral WHERE order_id=?", Integer.class, freshOrder)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT consecutive_deferrals FROM deferral WHERE order_id=? AND plan_id=?", Integer.class, styleOrder, dayOne)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT consecutive_deferrals FROM deferral WHERE order_id=? AND plan_id=?", Integer.class, styleOrder, dayTwo)).isEqualTo(3);
    }

    @Test void storeSeesOnlyItsNotifiedDeferralsAndAcknowledgesOnce() throws Exception {
        long plan = candidate("2026-06-26");
        defer(plan, 0, freshOrder, "NO_REEFER", true, true, null);
        defer(plan, 1, styleOrder, "CAPACITY", true, true, null);
        post("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Synthetic publish"), 200, dispatcher);

        Cookie store = login("STM-001", "synthetic-store-password");
        var notices = get("/api/v1/store/deferrals", store);
        assertThat(notices.size()).isEqualTo(1);
        assertThat(notices.get(0).path("orderRef").asText()).isEqualTo("SYN001");
        assertThat(notices.get(0).path("nextPlanningDate").asText()).isEqualTo("2026-06-27");
        assertThat(notices.get(0).path("acknowledgedAt").isNull()).isTrue();
        long id = notices.get(0).path("id").asLong();
        var ack = post("/api/v1/store/deferrals/" + id + "/acknowledge", Map.of(), 200, store);
        assertThat(ack.path("acknowledgedAt").isNull()).isFalse();
        post("/api/v1/store/deferrals/" + id + "/acknowledge", Map.of(), 200, store);
        assertThat(db.queryForObject("SELECT count(*) FROM deferral_acknowledgement", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='deferral.acknowledged'", Integer.class)).isEqualTo(1);

        long otherOutlet = db.queryForObject("SELECT id FROM deferral WHERE order_id=?", Long.class, styleOrder);
        var hidden = post("/api/v1/store/deferrals/" + otherOutlet + "/acknowledge", Map.of(), 404, store);
        assertThat(hidden.path("code").asText()).isEqualTo("NOT_FOUND");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/dispatcher/deferrals?date=2026-06-26&depot=Peliyagoda").cookie(store)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/store/deferrals")).andReturn(), 401, "UNAUTHENTICATED");
    }

    @Test void missingReasonsAndUnexplainedBacklogPersistNothing() throws Exception {
        long plan = candidate("2026-06-26");
        var noCode = post("/api/v1/dispatcher/plans/" + plan + "/orders/" + freshOrder + "/defer",
            Map.of("expectedVersion", 0, "reason", "No code"), 400, dispatcher);
        assertThat(noCode.path("code").asText()).isEqualTo("REASON_CODE_REQUIRED");
        post("/api/v1/dispatcher/plans/" + plan + "/orders/" + freshOrder + "/defer",
            Map.of("expectedVersion", 0, "reason", "", "reasonCode", "CAPACITY"), 400, dispatcher);
        post("/api/v1/dispatcher/plans/" + plan + "/orders/" + freshOrder + "/defer",
            Map.of("expectedVersion", 0, "reason", "Bad code", "reasonCode", "WEATHER"), 400, dispatcher);

        // A restored order is backlog, not a deferral: publication must refuse it.
        defer(plan, 0, freshOrder, "CAPACITY", true, true, null);
        post("/api/v1/dispatcher/plans/" + plan + "/orders/" + freshOrder + "/restore",
            Map.of("expectedVersion", 1, "reason", "Back to backlog"), 200, dispatcher);
        defer(plan, 2, styleOrder, "CAPACITY", true, true, null);
        var refused = post("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 3, "reason", "Backlog left"), 422, dispatcher);
        assertThat(refused.path("code").asText()).isEqualTo("ORDER_NOT_DEFERRED");
        assertThat(db.queryForObject("SELECT count(*) FROM deferral", Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE status='deferred'", Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?", String.class, plan)).isEqualTo("candidate");
    }

    @Test void historyIsAppendOnlyAndSourceFactsFlagRepeatSkips() throws Exception {
        db.update("UPDATE customer_order SET source_deferred_yesterday=true WHERE id=?", styleOrder);
        // The same evidence is readable before any candidate exists (queue defer dialog).
        var early = get("/api/v1/dispatcher/deferrals/fairness?date=2026-06-26&orderIds=" + styleOrder + "," + freshOrder, dispatcher);
        assertThat(early.size()).isEqualTo(2);
        for (JsonNode item : early) if (item.path("orderId").asLong() == styleOrder) {
            assertThat(item.path("deferredPreviousOperatingDay").asBoolean()).isTrue();
            assertThat(item.path("evidenceSource").asText()).isEqualTo("source");
        }
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/dispatcher/deferrals/fairness?date=2026-06-26&orderIds=" + styleOrder)
            .cookie(login("STM-001", "synthetic-store-password"))).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/dispatcher/deferrals/fairness?date=2099-01-01&orderIds=" + styleOrder)
            .cookie(dispatcher)).andReturn(), 404, "NOT_FOUND");
        long plan = candidate("2026-06-26");
        var fairness = get("/api/v1/dispatcher/plans/" + plan, dispatcher).path("fairness").path(String.valueOf(styleOrder));
        assertThat(fairness.path("deferredPreviousOperatingDay").asBoolean()).isTrue();
        assertThat(fairness.path("priorConsecutiveDeferrals").asInt()).isEqualTo(1);
        assertThat(fairness.path("evidenceSource").asText()).isEqualTo("source");
        assertThat(fairness.path("daysSinceLastServed").asInt()).isEqualTo(2);

        defer(plan, 0, freshOrder, "CAPACITY", true, true, null);
        defer(plan, 1, styleOrder, "CAPACITY", true, true, null);
        post("/api/v1/dispatcher/plans/" + plan + "/publish", Map.of("expectedVersion", 2, "reason", "Synthetic publish"), 200, dispatcher);
        assertThat(db.queryForObject("SELECT consecutive_deferrals FROM deferral WHERE order_id=?", Integer.class, styleOrder)).isEqualTo(2);
        assertThatThrownBy(() -> db.update("UPDATE deferral SET reason='rewritten'")).hasMessageContaining("append-only");
        assertThatThrownBy(() -> db.update("DELETE FROM deferral")).hasMessageContaining("append-only");
    }

    private long candidate(String date) throws Exception {
        long snapshot = post("/api/v1/dispatcher/planning/snapshots", Map.of("planDate", date, "depot", "Peliyagoda"), 201, dispatcher).path("id").asLong();
        return post("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Synthetic deferral run"), 201, dispatcher)
            .path("plan").path("id").asLong();
    }

    private void defer(long plan, int version, long order, String code, boolean protect, boolean notify, String next) throws Exception {
        var body = new HashMap<String, Object>(Map.of("expectedVersion", version, "reason", "Synthetic " + code,
            "reasonCode", code, "protectNextRun", protect, "notifyStore", notify));
        if (next != null) body.put("nextDeliveryDate", next);
        post("/api/v1/dispatcher/plans/" + plan + "/orders/" + order + "/defer", body, 200, dispatcher);
    }

    private JsonNode post(String path, Object body, int expected, Cookie session) throws Exception {
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).cookie(session)
                .header("X-Requested-With", "Waypoint").contentType("application/json").content(mapper.writeValueAsString(body)))
            .andExpect(status().is(expected)).andReturn();
        var json = mapper.readTree(response.getResponse().getContentAsString());
        if (expected >= 400) failure(response, expected, json.path("code").asText());
        return json;
    }

    private JsonNode get(String path, Cookie session) throws Exception {
        return mapper.readTree(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path).cookie(session))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
}
