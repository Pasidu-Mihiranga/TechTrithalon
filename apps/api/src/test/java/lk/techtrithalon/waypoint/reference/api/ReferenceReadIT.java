package lk.techtrithalon.waypoint.reference.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.Test;

class ReferenceReadIT extends ReferenceApiTestSupport {
    @Test
    void readsSeededValuesAndMallIntersection() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        for (var entry: java.util.Map.of("outlets",3,"vehicles",2,"districts",2,"depots",2,"service-allowances",9,"calendar?from=2026-06-26&to=2026-06-28",3).entrySet()) {
            mvc.perform(get("/api/v1/reference/"+entry.getKey()).cookie(cookie)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(entry.getValue()));
        }
        var result=mvc.perform(get("/api/v1/reference/outlets/OUT902").cookie(cookie)).andExpect(status().isOk())
            .andExpect(jsonPath("$.effectiveWindowOpen").value("10:00:00")).andExpect(jsonPath("$.effectiveWindowClose").value("12:00:00")).andReturn();
        assertThat(mapper.readTree(result.getResponse().getContentAsString()).path("brand").asText()).isEqualTo(db.queryForObject("SELECT brand FROM outlet WHERE outlet_id='OUT902'",String.class));
        mvc.perform(get("/api/v1/reference/vehicles/VEH901").cookie(cookie)).andExpect(jsonPath("$.weightCapKg").value(5000));
        mvc.perform(get("/api/v1/reference/outlets?brand=missing").cookie(cookie)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/reference/calendar?from=2030-01-01&to=2030-01-02").cookie(cookie)).andExpect(jsonPath("$.length()").value(0));
        failure(mvc.perform(get("/api/v1/reference/calendar?from=2026-06-28&to=2026-06-26").cookie(cookie)).andReturn(),400,"INVALID_DATE_RANGE");
        failure(mvc.perform(get("/api/v1/reference/calendar?from=bad&to=2026-06-26").cookie(cookie)).andReturn(),400,"BAD_REQUEST");
        for(String path:new String[]{"outlets/UNKNOWN","vehicles/UNKNOWN"}) failure(mvc.perform(get("/api/v1/reference/"+path).cookie(cookie)).andReturn(),404,"NOT_FOUND");
    }
    @Test
    void hidesOtherOwnersAndRejectsUnrelatedRoles() throws Exception {
        var store=login("STM-001","synthetic-store-password");
        mvc.perform(get("/api/v1/reference/outlets").cookie(store)).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].outletId").value("OUT901"));
        mvc.perform(get("/api/v1/reference/outlets/OUT901").cookie(store)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/reference/districts").cookie(store)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/v1/reference/depots").cookie(store)).andExpect(jsonPath("$[0]").value("Peliyagoda"));
        mvc.perform(get("/api/v1/reference/service-allowances").cookie(store)).andExpect(jsonPath("$.length()").value(3));
        failure(mvc.perform(get("/api/v1/reference/outlets/OUT902").cookie(store)).andReturn(),404,"NOT_FOUND");
        failure(mvc.perform(get("/api/v1/reference/vehicles").cookie(store)).andReturn(),403,"FORBIDDEN");
        var driver=login("DRV-001","synthetic-driver-password");
        for(String path:new String[]{"outlets","outlets/OUT901","vehicles","vehicles/VEH901","districts","depots","service-allowances","calendar?from=2026-06-26&to=2026-06-26"}) {
            failure(mvc.perform(get("/api/v1/reference/"+path)).andReturn(),401,"UNAUTHENTICATED");
            failure(mvc.perform(get("/api/v1/reference/"+path).cookie(driver)).andReturn(),403,"FORBIDDEN");
        }
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        try {
            var scoped=login("DSP-001","synthetic-dispatcher-password");
            mvc.perform(get("/api/v1/reference/vehicles").cookie(scoped)).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].vehicleId").value("VEH902"));
            failure(mvc.perform(get("/api/v1/reference/vehicles/VEH901").cookie(scoped)).andReturn(),404,"NOT_FOUND");
            failure(mvc.perform(get("/api/v1/reference/outlets/OUT901").cookie(scoped)).andReturn(),404,"NOT_FOUND");
        } finally { db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'"); }
    }
}
