package lk.techtrithalon.waypoint.fleetops.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.Test;

class FleetReadIT extends ReferenceApiTestSupport {

    @Test
    void listsDepotFleetWithSeededAvailability() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        mvc.perform(get("/api/v1/dispatcher/fleet?date=2026-06-26").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].vehicleId").value("VEH901"))
            .andExpect(jsonPath("$[0].availabilityStatus").value("available"))
            .andExpect(jsonPath("$[0].availabilityRecorded").value(true))
            .andExpect(jsonPath("$[1].vehicleId").value("VEH902"))
            .andExpect(jsonPath("$[1].availabilityRecorded").value(false));

        mvc.perform(get("/api/v1/dispatcher/fleet/VEH901?date=2026-06-26").cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.depot").value("Peliyagoda"))
            .andExpect(jsonPath("$.availabilityStatus").value("available"));

        db.update("UPDATE app_user SET depot='Peliyagoda' WHERE username='DSP-001'");
        try {
            Cookie scoped = login("DSP-001", "synthetic-dispatcher-password");
            mvc.perform(get("/api/v1/dispatcher/fleet?date=2026-06-26").cookie(scoped))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].vehicleId").value("VEH901"));
            failure(mvc.perform(get("/api/v1/dispatcher/fleet/VEH902?date=2026-06-26").cookie(scoped)).andReturn(),
                404, "NOT_FOUND");
        } finally {
            db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        }

        failure(mvc.perform(get("/api/v1/dispatcher/fleet").cookie(login("STM-001", "synthetic-store-password"))).andReturn(),
            403, "FORBIDDEN");
        failure(mvc.perform(get("/api/v1/dispatcher/fleet/UNKNOWN?date=2026-06-26").cookie(cookie)).andReturn(),
            404, "NOT_FOUND");
    }
}
