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

class PlanningSnapshotIT extends ReferenceApiTestSupport {

    @BeforeEach
    void clearSnapshots() {
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
}
