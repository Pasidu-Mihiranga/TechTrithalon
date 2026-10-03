package lk.techtrithalon.waypoint.planning.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Default EDD sequencing, explicit dispatcher sequences and schedule recomputation on reorder.
 * Uses one extra invented Fresh outlet (window 05:00-05:20) in synthetic district Alpha.
 */
@org.springframework.context.annotation.Import(PlanningSnapshotIT.ClockConfig.class)
class ManualSequencingIT extends ReferenceApiTestSupport {
    @Autowired PlanningSnapshotIT.SnapshotClock clock;
    private Cookie dispatcher;
    private long chilled;   // SYN001, OUT901, closes 07:30
    private long ambient;   // OUT901 ambient, closes 07:30, inserted after SYN001 so its ID is higher
    private long early;     // OUT904 ambient, closes 05:20
    private long plan;

    @BeforeEach void setup() throws Exception {
        clock.current = Instant.parse("2026-06-25T11:00:00Z");
        db.execute("TRUNCATE deferral_acknowledgement, deferral");
        db.update("DELETE FROM loading_issue"); db.update("DELETE FROM load_line"); db.update("DELETE FROM load_task");
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("""
            INSERT INTO outlet(outlet_id,brand,district,depot,dock_type,parking_constraint,window_open,window_close)
            VALUES('OUT904','Fresh','Alpha','Peliyagoda','street','normal','05:00','05:20') ON CONFLICT DO NOTHING""");
        insertOrder("SEQ-AMB", "OUT901");
        insertOrder("SEQ-EARLY", "OUT904");
        db.update("UPDATE customer_order SET status='confirmed',version=0,planning_date=order_date WHERE ref IN ('SYN001','SEQ-AMB','SEQ-EARLY')");
        db.update("UPDATE customer_order SET status='cancelled' WHERE ref='SYN002'");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        chilled = id("SYN001");
        ambient = id("SEQ-AMB");
        early = id("SEQ-EARLY");
        long snapshot = send("/api/v1/dispatcher/planning/snapshots", Map.of("planDate", "2026-06-26", "depot", "Peliyagoda"), 201)
            .path("id").asLong();
        plan = send("/api/v1/dispatcher/plans", Map.of("snapshotId", snapshot, "reason", "Synthetic sequencing"), 201)
            .path("plan").path("id").asLong();
    }

    @Test void newTripStartsInEddOrderWithOrderIdBreakingTies() throws Exception {
        var view = addTrip(List.of(ambient, chilled, early));
        // 05:20 closes first; the two 07:30 stops tie and fall back to ascending order ID.
        assertThat(stopIds(view)).containsExactly(early, chilled, ambient);
        assertThat(persistedSequence()).containsExactly(early, chilled, ambient);
        assertThat(view.path("validation").path("feasible").asBoolean()).isTrue();
    }

    @Test void moveWithoutPositionTakesItsEddSlotAndKeepsOtherStops() throws Exception {
        var view = addTrip(List.of(chilled, ambient));
        long trip = view.path("plan").path("trips").get(0).path("id").asLong();
        view = send("/api/v1/dispatcher/plans/" + plan + "/moves",
            Map.of("expectedVersion", 1, "reason", "Add early store", "orderId", early, "toTripId", trip), 200);
        assertThat(stopIds(view)).containsExactly(early, chilled, ambient);
    }

    @Test void explicitDispatcherSequenceIsKeptAndArrivalsAreRecomputed() throws Exception {
        var view = addTrip(List.of(early, chilled));
        long trip = view.path("plan").path("trips").get(0).path("id").asLong();
        String earlyArrivalBefore = arrival(view, early);
        // Not EDD, but still on time: early arrives 05:18 against a 05:20 close.
        view = send("/api/v1/dispatcher/plans/" + plan + "/trips/" + trip + "/sequence",
            Map.of("expectedVersion", 1, "reason", "Dispatcher order", "orderIds", List.of(chilled, early)), 200);
        assertThat(stopIds(view)).containsExactly(chilled, early);
        assertThat(persistedSequence()).containsExactly(chilled, early);
        assertThat(earlyArrivalBefore).isEqualTo("03:50:00");
        assertThat(arrival(view, early)).isEqualTo("05:18:00");
        // Trip minutes and distance do not depend on stop order within one district.
        assertThat(view.path("trips").get(0).path("tripMinutes").asInt()).isEqualTo(20 + 7 + 11 + 11);
    }

    @Test void reorderThatMakesAStopLateIsRejectedWithOneNamedViolationAndNothingSaved() throws Exception {
        var view = addTrip(List.of(early, chilled, ambient));
        long trip = view.path("plan").path("trips").get(0).path("id").asLong();
        // early would arrive 05:36, after its 05:20 close.
        var rejected = send("/api/v1/dispatcher/plans/" + plan + "/trips/" + trip + "/sequence",
            Map.of("expectedVersion", 1, "reason", "Late order", "orderIds", List.of(chilled, ambient, early)), 422);
        List<String> rules = new ArrayList<>();
        rejected.path("violations").forEach(v -> rules.add(v.path("ruleCode").asText()));
        assertThat(rules).containsExactly("DELIVERY_WINDOW");
        assertThat(rejected.path("violations").get(0).path("actualValue").asText()).isEqualTo("05:36");
        assertThat(persistedSequence()).containsExactly(early, chilled, ambient);
    }

    private JsonNode addTrip(List<Long> orderIds) throws Exception {
        return send("/api/v1/dispatcher/plans/" + plan + "/trips", Map.of("expectedVersion", 0, "reason", "Synthetic trip",
            "trip", Map.of("vehicleId", "VEH901", "tripIndex", 1, "brand", "Fresh", "district", "Alpha", "orderIds", orderIds)), 200);
    }

    private List<Long> stopIds(JsonNode view) {
        List<Long> ids = new ArrayList<>();
        view.path("trips").get(0).path("stops").forEach(s -> ids.add(s.path("orderId").asLong()));
        return ids;
    }

    private String arrival(JsonNode view, long orderId) {
        for (JsonNode stop : view.path("trips").get(0).path("stops"))
            if (stop.path("orderId").asLong() == orderId) return stop.path("plannedArrival").asText();
        throw new AssertionError("Stop not found: " + orderId);
    }

    private List<Long> persistedSequence() {
        return db.queryForList("SELECT order_id FROM stop WHERE plan_id=? ORDER BY seq", Long.class, plan);
    }

    private long id(String ref) {
        return db.queryForObject("SELECT id FROM customer_order WHERE ref=?", Long.class, ref);
    }

    private void insertOrder(String ref, String outlet) {
        db.update("""
            INSERT INTO customer_order(ref,outlet_id,brand,depot,district,order_date,placed_at,confirmed_at,temp_requirement,
              units,weight_kg,volume_m3,status,iso_year,iso_week,version,updated_at)
            SELECT ?,?,'Fresh','Peliyagoda','Alpha',DATE '2026-06-26',now(),now(),'ambient',5,50.00,0.300,'confirmed',2026,26,0,now()
            WHERE NOT EXISTS (SELECT 1 FROM customer_order WHERE ref=?)""", ref, outlet, ref);
    }

    private JsonNode send(String path, Object body, int expected) throws Exception {
        var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path).cookie(dispatcher)
                .header("X-Requested-With", "Waypoint").contentType("application/json").content(mapper.writeValueAsString(body)))
            .andExpect(status().is(expected)).andReturn();
        var json = mapper.readTree(response.getResponse().getContentAsString());
        if (expected >= 400) failure(response, expected, json.path("code").asText());
        return json;
    }
}
