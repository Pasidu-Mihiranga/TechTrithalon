package lk.techtrithalon.waypoint.ordering.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MvcResult;

@Import(OrderCommandIT.ClockConfig.class)
class OrderCommandIT extends ReferenceApiTestSupport {
    @Autowired MutableClock clock;

    @BeforeEach
    void beforeCutoffOnThursday() {
        // 2026-06-25 10:00 Asia/Colombo — before 16:00, next operating day is Fri 26.
        clock.instant = Instant.parse("2026-06-25T04:30:00Z");
        db.update("DELETE FROM audit_event WHERE type='order.confirmed'");
        db.update("DELETE FROM customer_order WHERE ref LIKE 'ORD-%'");
    }

    @Test
    void storeManagerConfirmsOrderForNextOperatingDay() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        MvcResult created = mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient",
                "units", 10,
                "weightKg", 75.5,
                "volumeM3", 0.42
            )))).andReturn();
        assertThat(created.getResponse().getStatus()).isEqualTo(201);
        var body = mapper.readTree(created.getResponse().getContentAsString());
        assertThat(body.path("status").asText()).isEqualTo("confirmed");
        assertThat(body.path("orderDate").asText()).isEqualTo("2026-06-26");
        assertThat(body.path("outletId").asText()).isEqualTo("OUT901");
        assertThat(body.path("ref").asText()).startsWith("ORD-");
        assertThat(body.path("placedBy").asLong())
            .isEqualTo(db.queryForObject("SELECT id FROM app_user WHERE username='STM-001'", Long.class));
        assertThat(db.queryForObject(
            "SELECT count(*) FROM audit_event WHERE type='order.confirmed' AND entity_id=?",
            Integer.class, body.path("id").asText())).isEqualTo(1);
    }

    @Test
    void afterCutoffRollsToFollowingOperatingDayAndFreshMayPlaceBothTemps() throws Exception {
        clock.instant = Instant.parse("2026-06-25T11:00:00Z"); // 16:30 Colombo
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 4, "weightKg", 28.0, "volumeM3", 0.15
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.orderDate").value("2026-06-27"));
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint")
            .contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "chilled", "units", 5, "weightKg", 35.0, "volumeM3", 0.2
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.tempRequirement").value("chilled"))
            .andExpect(jsonPath("$.orderDate").value("2026-06-27"));
    }

    @Test
    void rejectsBadQuantitiesDuplicateTempNonFreshChilledAndWrongRole() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 0, "weightKg", 10, "volumeM3", 0.1
            )))).andReturn(), 400, "VALIDATION_FAILED");
        failure(mvc.perform(post("/api/v1/store/orders").cookie(dispatcher)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            )))).andReturn(), 403, "FORBIDDEN");

        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            )))).andExpect(status().isCreated());
        failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 3, "weightKg", 12, "volumeM3", 0.12
            )))).andReturn(), 409, "DUPLICATE_TEMP_ORDER");

        db.update("UPDATE outlet SET brand='Style' WHERE outlet_id='OUT901'");
        try {
            failure(mvc.perform(post("/api/v1/store/orders").cookie(store)
                .header("X-Requested-With", "Waypoint").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of(
                    "tempRequirement", "chilled", "units", 2, "weightKg", 10, "volumeM3", 0.1
                )))).andReturn(), 422, "CHILLED_FRESH_ONLY");
        } finally {
            db.update("UPDATE outlet SET brand='Fresh' WHERE outlet_id='OUT901'");
        }
    }

    @Test
    void sundayHolidayAnchorSkipsToNextOperatingDay() throws Exception {
        // Saturday 27 after cutoff → anchor Sunday 28 → first operating after 28 is Monday 29.
        clock.instant = Instant.parse("2026-06-27T11:00:00Z");
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(post("/api/v1/store/orders").cookie(store)
            .header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of(
                "tempRequirement", "ambient", "units", 2, "weightKg", 10, "volumeM3", 0.1
            ))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.orderDate").value("2026-06-29"));
    }

    static class MutableClock extends Clock {
        Instant instant = Instant.parse("2026-06-25T04:30:00Z");
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Colombo"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary MutableClock mutableClock() { return new MutableClock(); }
    }
}
