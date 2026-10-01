package lk.techtrithalon.waypoint.fleetops.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import jakarta.servlet.http.Cookie;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class FleetControllerIT extends ReferenceApiTestSupport {
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    lk.techtrithalon.waypoint.audit.application.AuditService audit;

    @Test void auditFailureRollsBackAvailabilityAndReturnsSanitizedError() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        org.mockito.Mockito.doThrow(new IllegalStateException("Synthetic audit failure"))
            .when(audit).record(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
        failure(change(cookie,"2026-06-26","in_workshop",0),500,"INTERNAL_ERROR");
        assertThat(db.queryForObject("SELECT count(*) FROM vehicle_availability",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isZero();
    }

    @Test void concurrentCreationAllowsOnlyOneWinner() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var start=new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.Callable<Integer> save=() -> { start.await(); return change(cookie,"2026-06-26","in_workshop",0).getResponse().getStatus(); };
            var first=executor.submit(save);
            var second=executor.submit(save);
            start.countDown();
            assertThat(java.util.List.of(first.get(10,java.util.concurrent.TimeUnit.SECONDS),second.get(10,java.util.concurrent.TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200,409);
        }
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(1);
    }

    @BeforeEach void resetFleet() {
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM vehicle_availability");
        db.update("DELETE FROM fuel_ledger");
    }
    private MvcResult change(Cookie cookie,String date,String status,long version) throws Exception {
        return mvc.perform(patch("/api/v1/dispatcher/vehicles/VEH901/availability").cookie(cookie)
            .header("X-Requested-With","Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(java.util.Map.of("date",date,"status",status,"note","Synthetic workshop verification","expectedVersion",version)))).andReturn();
    }
    @Test void hidesVehiclesOutsideDispatcherDepot() throws Exception {
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        try {
            var cookie=login("DSP-001","synthetic-dispatcher-password");
            for(String suffix:new String[]{"availability","fuel"}) {
                failure(mvc.perform(get("/api/v1/dispatcher/vehicles/VEH901/"+suffix+"?date=2026-06-26").cookie(cookie)).andReturn(),404,"NOT_FOUND");
            }
            failure(change(cookie,"2026-06-26","available",0),404,"NOT_FOUND");
        } finally { db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'"); }
    }

    @Test void transitionsPersistWithOptimisticVersionAndTrustedAuditActor() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        mvc.perform(get("/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-26").cookie(cookie))
            .andExpect(jsonPath("$.recorded").value(false)).andExpect(jsonPath("$.status").isEmpty());
        var workshop=change(cookie,"2026-06-26","in_workshop",0);
        assertThat(workshop.getResponse().getStatus()).isEqualTo(200);
        assertThat(mapper.readTree(workshop.getResponse().getContentAsString()).path("version").asLong()).isEqualTo(1);
        mvc.perform(get("/api/v1/dispatcher/vehicles/VEH901/availability?date=2026-06-26").cookie(cookie))
            .andExpect(jsonPath("$.status").value("in_workshop")).andExpect(jsonPath("$.recorded").value(true));
        failure(change(cookie,"2026-06-26","available",0),409,"STALE_AVAILABILITY");
        assertThat(change(cookie,"2026-06-26","available",1).getResponse().getStatus()).isEqualTo(200);
        assertThat(db.queryForObject("SELECT version FROM vehicle_availability",Long.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(2);
        var audit=db.queryForMap("SELECT actor_id, before_json->>'status' previous, after_json->>'status' current FROM audit_event ORDER BY id DESC LIMIT 1");
        assertThat(audit).containsEntry("previous","in_workshop").containsEntry("current","available")
            .containsEntry("actor_id",db.queryForObject("SELECT id FROM app_user WHERE username='DSP-001'",Long.class));
    }
    @Test void rejectsInvalidDatesStatesVersionsAndRolesWithoutWrites() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        failure(change(cookie,"2026-06-26","broken",0),400,"VALIDATION_FAILED");
        failure(change(cookie,"2026-06-28","in_workshop",0),422,"NON_OPERATING_DAY");
        failure(change(cookie,"2030-01-01","available",0),404,"NOT_FOUND");
        failure(change(cookie,"2026-06-26","available",1),409,"STALE_AVAILABILITY");
        failure(change(cookie,"2026-06-26","available",-1),400,"VALIDATION_FAILED");
        var store=login("STM-001","synthetic-store-password");
        for(String suffix:new String[]{"availability","fuel"}) {
            String path="/api/v1/dispatcher/vehicles/VEH901/"+suffix+"?date=2026-06-26";
            failure(mvc.perform(get(path)).andReturn(),401,"UNAUTHENTICATED");
            failure(mvc.perform(get(path).cookie(store)).andReturn(),403,"FORBIDDEN");
            failure(mvc.perform(get(path.replace("VEH901","UNKNOWN")).cookie(cookie)).andReturn(),404,"NOT_FOUND");
        }
        failure(change(store,"2026-06-26","available",0),403,"FORBIDDEN");
        failure(mvc.perform(patch("/api/v1/dispatcher/vehicles/VEH901/availability").header("X-Requested-With","Waypoint").contentType("application/json").content("{}")).andReturn(),401,"UNAUTHENTICATED");
        assertThat(db.queryForObject("SELECT count(*) FROM vehicle_availability",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isZero();
    }
    @Test void calculatesWeeklyRemainingFromCommittedFuelAndReportsMissingHonestly() throws Exception {
        var cookie=login("DSP-001","synthetic-dispatcher-password");
        String path="/api/v1/dispatcher/vehicles/VEH901/fuel?date=2026-06-26";
        mvc.perform(get(path).cookie(cookie)).andExpect(jsonPath("$.recorded").value(false)).andExpect(jsonPath("$.remainingLitres").isEmpty());
        db.update("INSERT INTO fuel_ledger VALUES ('VEH901',2026,26,125.25,90.50)");
        mvc.perform(get(path).cookie(cookie)).andExpect(jsonPath("$.recorded").value(true)).andExpect(jsonPath("$.quotaLitres").value(400))
            .andExpect(jsonPath("$.committedLitres").value(125.25)).andExpect(jsonPath("$.actualLitres").value(90.5)).andExpect(jsonPath("$.remainingLitres").value(274.75));
    }
}
