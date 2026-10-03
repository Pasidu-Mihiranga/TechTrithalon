package lk.techtrithalon.waypoint.reference.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.Test;

/** District geography for maps, and the planning queue grouped by district. Invented fixtures only. */
class GeographyIT extends ReferenceApiTestSupport {
    private JsonNode json(org.springframework.test.web.servlet.MvcResult result) throws Exception {
        return mapper.readTree(result.getResponse().getContentAsString());
    }

    @Test void geographyJoinsPublicBoundariesWithTheCallersTravelRowsAndLocatesNoOutlet() throws Exception {
        var dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        var view = json(mvc.perform(get("/api/v1/reference/geography").cookie(dispatcher))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn());
        assertThat(view.path("attribution").asText()).contains("OpenStreetMap").contains("ODbL");
        assertThat(view.path("districts").size()).isEqualTo(25);
        view.path("districts").forEach(d -> {
            assertThat(d.path("geometry").path("type").asText()).isIn("Polygon", "MultiPolygon");
            assertThat(d.path("labelPoint").size()).isEqualTo(2);
        });
        // The synthetic fixture districts (Alpha, Beta) are not real places, so none is marked as served.
        assertThat(view.path("districts").findValuesAsText("served")).containsOnly("false");
        // Links carry the fixture's own competition-style figures; nothing is invented.
        assertThat(view.path("links").size()).isEqualTo(2);
        var alpha = view.path("links").get(0);
        assertThat(alpha.path("district").asText()).isEqualTo("Alpha");
        assertThat(alpha.path("depotToDistrictKm").decimalValue()).isEqualByComparingTo("10");
        assertThat(alpha.path("depotToDistrictMinutes").asInt()).isEqualTo(20);
        assertThat(alpha.path("interStopMinutes").asInt()).isEqualTo(7);
        assertThat(view.path("depots").size()).isEqualTo(2);
        assertThat(view.path("depots").get(0).path("basis").asText()).contains("approximate");
        assertThat(view.toString()).doesNotContain("outlet");
    }

    @Test void aStoreManagerSeesOnlyTheirOwnDepotAndEveryRoleGuardHolds() throws Exception {
        var store = login("STM-001", "synthetic-store-password");
        var view = json(mvc.perform(get("/api/v1/reference/geography").cookie(store)).andReturn());
        assertThat(view.path("links").size()).isEqualTo(1);
        assertThat(view.path("depots").size()).isEqualTo(1);
        assertThat(view.path("depots").get(0).path("name").asText()).isEqualTo("Peliyagoda");
        failure(mvc.perform(get("/api/v1/reference/geography")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/reference/geography").cookie(login("LDR-001", "synthetic-loader-password"))).andReturn(), 403, "FORBIDDEN");
    }

    @Test void theQueueIsGroupedByDistrictWithServerComputedTotals() throws Exception {
        db.update("UPDATE customer_order SET status='confirmed',planning_date=order_date WHERE ref IN ('SYN001','SYN002')");
        var dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        var rows = json(mvc.perform(get("/api/v1/dispatcher/orders/districts?date=2026-06-26&depot=Peliyagoda").cookie(dispatcher)).andReturn());
        assertThat(rows.size()).isEqualTo(1);
        var alpha = rows.get(0);
        assertThat(alpha.path("district").asText()).isEqualTo("Alpha");
        assertThat(alpha.path("orders").asInt()).isEqualTo(2);
        assertThat(alpha.path("chilledOrders").asInt()).isEqualTo(1);
        assertThat(alpha.path("ambientOrders").asInt()).isEqualTo(1);
        assertThat(alpha.path("volumeM3").decimalValue()).isEqualByComparingTo("1.890");
        failure(mvc.perform(get("/api/v1/dispatcher/orders/districts?date=2026-06-26&depot=Peliyagoda")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/dispatcher/orders/districts?date=2026-06-26&depot=Peliyagoda")
            .cookie(login("STM-001", "synthetic-store-password"))).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/dispatcher/orders/districts?date=2026-06-26&depot=Nowhere").cookie(dispatcher)).andReturn(), 404, "NOT_FOUND");
    }
}
