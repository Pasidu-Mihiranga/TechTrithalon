package lk.techtrithalon.waypoint.ordering.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

class OrderQueryIT extends ReferenceApiTestSupport {

    @Test
    @Transactional
    void planningSummaryIncludesOrdersBeyondThePageLimitAndFiltersVanOnlyOrders() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        for (int i = 0; i < 205; i++) {
            String outlet = String.format("Q%06d", i);
            db.update("""
                INSERT INTO outlet(outlet_id,brand,district,depot,dock_type,parking_constraint,window_open,window_close)
                VALUES (?,'Fresh','Alpha','Peliyagoda','street','van_only','05:00','07:30')
                """, outlet);
            db.update("""
                INSERT INTO customer_order(ref,outlet_id,brand,depot,district,order_date,placed_at,confirmed_at,
                    temp_requirement,units,weight_kg,volume_m3,status,iso_year,iso_week,updated_at)
                SELECT ?,?,'Fresh','Peliyagoda','Alpha',order_date,placed_at,confirmed_at,
                    'chilled',1,10,1.250,'confirmed',iso_year,iso_week,updated_at
                FROM customer_order WHERE ref='SYN001'
                """, "QUEUE-" + i, outlet);
        }
        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&depot=Peliyagoda&size=200").cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(200))
            .andExpect(jsonPath("$.total").value(207));
        mvc.perform(get("/api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda").cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalOrders").value(207))
            .andExpect(jsonPath("$.ambientOrders").value(1))
            .andExpect(jsonPath("$.chilledOrders").value(206))
            .andExpect(jsonPath("$.vanOnlyOrders").value(206))
            .andExpect(jsonPath("$.totalVolumeM3").value(258.14));
        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&parkingConstraint=van_only&q=SYN").cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].ref").value("SYN001"));
        failure(mvc.perform(get("/api/v1/dispatcher/orders?parkingConstraint=invalid").cookie(cookie)).andReturn(),
            400, "INVALID_FILTER");
    }

    @Test
    @Transactional
    void planningSummaryEnforcesSessionRoleAndDepotScope() throws Exception {
        String path = "/api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Peliyagoda";
        failure(mvc.perform(get(path)).andReturn(), 401, "UNAUTHENTICATED");
        Cookie store = login("STM-001", "synthetic-store-password");
        failure(mvc.perform(get(path).cookie(store)).andReturn(), 403, "FORBIDDEN");
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(get(path).cookie(dispatcher)).andReturn(), 404, "NOT_FOUND");
        mvc.perform(get("/api/v1/dispatcher/orders/summary?date=2026-06-26&depot=Kandy").cookie(dispatcher))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalOrders").value(0));
    }

    @Test
    void dispatcherReadsSeededOrdersAndHonestDashboardMetrics() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        mvc.perform(get("/api/v1/dispatcher/dashboard?date=2026-06-26&depot=Kandy").cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ordersToPlan.value").value(0))
            .andExpect(jsonPath("$.depot").value("Kandy"));
        failure(mvc.perform(get("/api/v1/dispatcher/dashboard?depot=UNKNOWN").cookie(cookie)).andReturn(),
            404, "NOT_FOUND");
        mvc.perform(get("/api/v1/dispatcher/dashboard?date=2026-06-26").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ordersToPlan.value").value(2))
            .andExpect(jsonPath("$.ordersToPlan.available").value(true))
            .andExpect(jsonPath("$.ordersPlanned.available").value(true))
            .andExpect(jsonPath("$.ordersPlanned.value").value(0))
            .andExpect(jsonPath("$.tripsReady.value").value(0))
            .andExpect(jsonPath("$.activeTrips.value").value(0))
            .andExpect(jsonPath("$.activeTrips.available").value(true))
            .andExpect(jsonPath("$.exceptions.value").value(0))
            .andExpect(jsonPath("$.exceptions.available").value(true))
            .andExpect(jsonPath("$.orderAttention").isEmpty())
            .andExpect(jsonPath("$.tripAttention").isEmpty())
            .andExpect(jsonPath("$.planningProgress.available").value(true))
            .andExpect(jsonPath("$.planningProgress.planned").value(0))
            .andExpect(jsonPath("$.planningProgress.total").value(2));

        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&sort=ref&asc=true").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.items[0].ref").value("SYN001"))
            .andExpect(jsonPath("$.items[0].status").value("confirmed"))
            .andExpect(jsonPath("$.items[1].ref").value("SYN002"));

        mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26&brand=Fresh").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].outletId").value("OUT901"));

        long id = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        mvc.perform(get("/api/v1/dispatcher/orders/" + id).cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ref").value("SYN001"))
            .andExpect(jsonPath("$.tempRequirement").value("chilled"));
    }

    @Test
    void storeManagerSeesOnlyOwnOutletOrdersAndCutoff() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(get("/api/v1/store/orders").cookie(store))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].outletId").value("OUT901"))
            .andExpect(jsonPath("$.items[0].ref").value("SYN001"));

        long ownId = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'", Long.class);
        long otherId = db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'", Long.class);
        mvc.perform(get("/api/v1/store/orders/" + ownId).cookie(store))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ref").value("SYN001"));
        failure(mvc.perform(get("/api/v1/store/orders/" + otherId).cookie(store)).andReturn(), 404, "NOT_FOUND");

        mvc.perform(get("/api/v1/store/cutoff").cookie(store))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cutoffLocalTime").value("16:00:00"))
            .andExpect(jsonPath("$.timeZone").value("Asia/Colombo"))
            .andExpect(jsonPath("$.secondsRemaining").isNumber())
            .andExpect(jsonPath("$.nextDeliveryDate").isNotEmpty());
    }

    @Test
    void enforcesRolesAndUnknownIds() throws Exception {
        Cookie dispatcher = login("DSP-001", "synthetic-dispatcher-password");
        Cookie store = login("STM-001", "synthetic-store-password");
        failure(mvc.perform(get("/api/v1/dispatcher/orders")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/dispatcher/orders").cookie(store)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/store/orders").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/dispatcher/orders/999999").cookie(dispatcher)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get("/api/v1/store/cutoff").cookie(dispatcher)).andReturn(), 403, "FORBIDDEN");

        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        try {
            Cookie kandy = login("DSP-001", "synthetic-dispatcher-password");
            failure(mvc.perform(get("/api/v1/dispatcher/dashboard?depot=Peliyagoda").cookie(kandy)).andReturn(),
                404, "NOT_FOUND");
            mvc.perform(get("/api/v1/dispatcher/orders?date=2026-06-26").cookie(kandy))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
            assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE depot='Peliyagoda'", Integer.class))
                .isEqualTo(2);
        } finally {
            db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        }
    }
}
