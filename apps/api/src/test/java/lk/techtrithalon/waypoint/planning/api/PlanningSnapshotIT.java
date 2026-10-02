package lk.techtrithalon.waypoint.planning.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

@org.springframework.context.annotation.Import(PlanningSnapshotIT.ClockConfig.class)
class PlanningSnapshotIT extends ReferenceApiTestSupport {
    @org.springframework.beans.factory.annotation.Autowired SnapshotClock clock;


    @BeforeEach
    void clearSnapshots() {
        clock.current = java.time.Instant.parse("2026-06-25T11:00:00Z");
        db.update("DELETE FROM planning_snapshot");
    }

    @Test
    void createsImmutableSnapshotWithStableHashAndMembership() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        long syn1 = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        long syn2 = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);

        MvcResult created = mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda"
            )))).andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        var body = mapper.readTree(created.getResponse().getContentAsString());
        assertThat(body.path("depot").asText()).isEqualTo("Peliyagoda");
        assertThat(body.path("planDate").asText()).isEqualTo("2026-06-26");
        assertThat(body.path("orderIds").isArray()).isTrue();
        assertThat(body.path("orderIds")).extracting(n -> n.asLong()).containsExactlyInAnyOrder(syn1, syn2);
        assertThat(body.path("contentHash").asText()).hasSize(64);
        assertThat(body.path("fleet").isArray()).isTrue();
        assertThat(body.path("fleet")).isNotEmpty();
        long id = body.path("id").asLong();
        String hash = body.path("contentHash").asText();

        mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id).cookie(dispatcher))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.contentHash").value(hash))
            .andExpect(jsonPath("$.orderIds.length()").value(2));

        mvc.perform(get("/api/v1/dispatcher/planning/snapshots?date=2026-06-26&depot=Peliyagoda").cookie(dispatcher))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id));

        mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id + "/compare").cookie(dispatcher))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unchanged").value(true))
            .andExpect(jsonPath("$.snapshotHash").value(hash));

        // No update endpoint — immutability is insert-only; repeated create yields a new row.
        MvcResult again = mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda",
                "orderIds", List.of(syn1)
            )))).andReturn();
        assertThat(again.getResponse().getStatus()).isEqualTo(201);
        var againBody = mapper.readTree(again.getResponse().getContentAsString());
        assertThat(againBody.path("id").asLong()).isNotEqualTo(id);
        assertThat(againBody.path("orderIds")).extracting(n -> n.asLong()).containsExactly(syn1);
        assertThat(againBody.path("contentHash").asText()).isNotEqualTo(hash);
    }

    @Test
    void rejectsNonOperatingDayBadSelectionMissingDepotAndWrongRole() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        Cookie store = login("STM-001", "synthetic-store-password");

        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26"
            )))).andReturn(), 400, "DEPOT_REQUIRED");

        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-28",
                "depot", "Peliyagoda"
            )))).andReturn(), 422, "OPERATING_DAY");

        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda",
                "orderIds", List.of(999999L)
            )))).andReturn(), 422, "SELECTION_INVALID");

        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda"
            )))).andReturn(), 403, "FORBIDDEN");

        failure(mvc.perform(get("/api/v1/dispatcher/planning/snapshots/1")).andReturn(), 401, "UNAUTHENTICATED");
    }

    @Test
    void hashChangesWhenFleetAvailabilityChanges() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        MvcResult first = mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda"
            )))).andExpect(status().isCreated()).andReturn();
        String hash1 = mapper.readTree(first.getResponse().getContentAsString()).path("contentHash").asText();

        db.update("""
            INSERT INTO vehicle_availability (vehicle_id, date, status, note, version, updated_by, updated_at)
            VALUES ('VEH901', '2026-06-26', 'in_workshop', 'test', 1, 1, now())
            ON CONFLICT (vehicle_id, date) DO UPDATE SET status='in_workshop', version=vehicle_availability.version+1
            """);

        MvcResult second = mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "planDate", "2026-06-26",
                "depot", "Peliyagoda"
            )))).andExpect(status().isCreated()).andReturn();
        String hash2 = mapper.readTree(second.getResponse().getContentAsString()).path("contentHash").asText();
        assertThat(hash2).isNotEqualTo(hash1);

        long id = mapper.readTree(first.getResponse().getContentAsString()).path("id").asLong();
        mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id + "/compare").cookie(dispatcher))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unchanged").value(false));
    }
    @Test
    void selectedSnapshotIgnoresUnselectedMembershipButDetectsOrderAndReferenceChanges() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        long orderId = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        var created = mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("planDate", "2026-06-26", "depot", "Peliyagoda", "orderIds", List.of(orderId)))))
            .andExpect(status().isCreated()).andReturn();
        var frozen = mapper.readTree(created.getResponse().getContentAsString());
        long id = frozen.path("id").asLong();
        assertThat(frozen.path("inputs").path("orders").size()).isEqualTo(1);
        assertThat(frozen.path("inputs").path("reference").path("outlets")).isNotEmpty();
        assertThat(frozen.path("fleet").get(0).has("kmPerL")).isTrue();
        mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id + "/compare").cookie(dispatcher))
            .andExpect(jsonPath("$.unchanged").value(true));
        var originalWeight = db.queryForObject("SELECT weight_kg FROM customer_order WHERE id=?", java.math.BigDecimal.class, orderId);
        try {
            db.update("UPDATE customer_order SET weight_kg=weight_kg+1, version=version+1 WHERE id=?", orderId);
            mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id + "/compare").cookie(dispatcher))
                .andExpect(jsonPath("$.unchanged").value(false));
            mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id).cookie(dispatcher))
                .andExpect(jsonPath("$.contentHash").value(frozen.path("contentHash").asText()))
                .andExpect(jsonPath("$.inputs.orders[0].weightKg").value(originalWeight.doubleValue()));
        } finally { db.update("UPDATE customer_order SET weight_kg=?, version=0 WHERE id=?", originalWeight, orderId); }
        try {
            db.update("UPDATE district_travel SET inter_stop_min=inter_stop_min+1 WHERE depot='Peliyagoda'");
            mvc.perform(get("/api/v1/dispatcher/planning/snapshots/" + id + "/compare").cookie(dispatcher))
                .andExpect(jsonPath("$.unchanged").value(false));
        } finally { db.update("UPDATE district_travel SET inter_stop_min=inter_stop_min-1 WHERE depot='Peliyagoda'"); }
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='planning.snapshot.created' AND entity_id=?", Integer.class, String.valueOf(id))).isGreaterThanOrEqualTo(1);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> db.update("UPDATE planning_snapshot SET content_hash='changed' WHERE id=?", id))
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void depotQueueIsPaginatedAndSelectionCannotCrossDepots() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&size=1&page=1").cookie(dispatcher))
            .andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.items.length()").value(1))
            .andExpect(jsonPath("$.items[0].ref").value("SYN002"));
        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&depot=Kandy").cookie(dispatcher))
            .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void cutoffBoundaryAndPayloadValidationAreEnforced() throws Exception {
        clock.current = java.time.Instant.parse("2026-06-25T10:29:59Z");
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        String payload = "{\"planDate\":\"2026-06-26\",\"depot\":\"Peliyagoda\"}";
        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json").content(payload)).andReturn(), 409, "ORDERS_NOT_CLOSED");
        clock.current = java.time.Instant.parse("2026-06-25T10:30:00Z");
        mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json").content(payload)).andExpect(status().isCreated());
        failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"planDate\":\"2026-06-26\",\"depot\":\"Peliyagoda\",\"orderIds\":[null,-1]}"))
            .andReturn(), 400, "VALIDATION_FAILED");
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        try {
            Cookie scoped = login("DSP-001", "synthetic-dispatcher-password");
            failure(mvc.perform(get("/api/v1/dispatcher/orders?depot=Peliyagoda").cookie(scoped)).andReturn(), 404, "NOT_FOUND");
            failure(mvc.perform(post("/api/v1/dispatcher/planning/snapshots").cookie(scoped)
                .header("X-Requested-With", "Waypoint").contentType("application/json").content(payload)).andReturn(), 404, "NOT_FOUND");
        } finally { db.update("UPDATE app_user SET depot=null WHERE username='DSP-001'"); }
    }

    static class SnapshotClock extends java.time.Clock {
        java.time.Instant current = java.time.Instant.parse("2026-06-25T11:00:00Z");
        @Override public java.time.ZoneId getZone() { return java.time.ZoneId.of("Asia/Colombo"); }
        @Override public java.time.Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public java.time.Instant instant() { return current; }
    }
    @org.springframework.boot.test.context.TestConfiguration
    static class ClockConfig {
        @org.springframework.context.annotation.Bean @org.springframework.context.annotation.Primary
        SnapshotClock snapshotClock() { return new SnapshotClock(); }
    }

}
