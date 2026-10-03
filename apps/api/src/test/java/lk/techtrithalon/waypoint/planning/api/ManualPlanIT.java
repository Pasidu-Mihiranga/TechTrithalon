package lk.techtrithalon.waypoint.planning.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.*;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import lk.techtrithalon.waypoint.reference.infrastructure.ReferenceApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ManualPlanIT extends ReferenceApiTestSupport {
    @MockitoSpyBean AuditService audit;
    private Cookie dispatcher;
    private long freshOrder;
    private long styleOrder;
    private long snapshot;
    @BeforeEach void setup() throws Exception {
        reset(audit);
        db.update("DELETE FROM plan");
        db.update("DELETE FROM planning_snapshot");
        db.update("DELETE FROM audit_event");
        db.update("DELETE FROM fuel_ledger");
        db.update("UPDATE customer_order SET status='confirmed',version=0 WHERE ref IN ('SYN001','SYN002')");
        db.update("UPDATE outlet SET parking_constraint='normal' WHERE outlet_id='OUT901'");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        dispatcher=login("DSP-001","synthetic-dispatcher-password");
        freshOrder=db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN001'",Long.class);
        styleOrder=db.queryForObject("SELECT id FROM customer_order WHERE ref='SYN002'",Long.class);
        snapshot=postJson("/api/v1/dispatcher/planning/snapshots",Map.of("planDate","2026-06-26","depot","Peliyagoda"),201).path("id").asLong();
    }
    private JsonNode postJson(String path,Object body,int expected) throws Exception {
        var response=mvc.perform(post(path).cookie(dispatcher).header("X-Requested-With","Waypoint")
            .contentType("application/json").content(mapper.writeValueAsString(body))).andExpect(status().is(expected)).andReturn();
        if (expected>=400) failure(response,expected,mapper.readTree(response.getResponse().getContentAsString()).path("code").asText());
        return mapper.readTree(response.getResponse().getContentAsString());
    }
    private long candidate() throws Exception {
        return postJson("/api/v1/dispatcher/plans",Map.of("snapshotId",snapshot,"reason","Synthetic manual planning"),201).path("plan").path("id").asLong();
    }
    private JsonNode read(long id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/v1/dispatcher/plans/"+id).cookie(dispatcher)).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
    }
    private Map<String,Object> trip(String brand,int slot,List<Long> ids) {
        return Map.of("vehicleId","VEH901","tripIndex",slot,"brand",brand,"district","Alpha","orderIds",ids);
    }
    private JsonNode add(long id,int version,String brand,int slot,List<Long> ids) throws Exception {
        return postJson("/api/v1/dispatcher/plans/"+id+"/trips",Map.of("expectedVersion",version,"reason","Synthetic assignment","trip",trip(brand,slot,ids)),200);
    }
    @Test void createsEditsResequencesDefersRestoresAndPublishesWithoutPython() throws Exception {
        long plan=candidate();
        assertThat(read(plan).path("unassignedOrders").size()).isEqualTo(2);
        var first=add(plan,0,"Fresh",1,List.of(freshOrder));
        long firstTrip=first.path("trips").get(0).path("id").asLong();
        assertThat(first.path("trips").get(0).path("tripMinutes").asInt()).isEqualTo(31);
        assertThat(first.path("validation").path("metrics").path("assignedVolumeM3").decimalValue())
            .isEqualByComparingTo("1.250");
        var metrics=first.path("validation").path("metrics");
        assertThat(metrics.path("totalOrders").asInt()).isEqualTo(2);
        assertThat(metrics.path("availableVehicles").asInt()).isPositive();
        assertThat(metrics.path("totalOrderVolumeM3").decimalValue()).isGreaterThanOrEqualTo(metrics.path("assignedVolumeM3").decimalValue());
        var load=first.path("utilisation").get(String.valueOf(firstTrip));
        assertThat(load.path("stopCount").asInt()).isEqualTo(1);
        assertThat(load.path("volumeUtilisationPct").decimalValue()).isPositive();
        postJson("/api/v1/dispatcher/plans/"+plan+"/trips/"+firstTrip+"/sequence",
            Map.of("expectedVersion",1,"reason","Synthetic route review","orderIds",List.of(freshOrder)),200);
        add(plan,2,"Style",2,List.of(styleOrder));
        postJson("/api/v1/dispatcher/plans/"+plan+"/orders/"+styleOrder+"/defer",
            Map.of("expectedVersion",3,"reason","Synthetic deferred delivery","nextDeliveryDate","2026-06-27"),200);
        postJson("/api/v1/dispatcher/plans/"+plan+"/orders/"+styleOrder+"/restore",
            Map.of("expectedVersion",4,"reason","Synthetic restore"),200);
        var restored=read(plan);
        long target=restored.path("plan").path("trips").get(1).path("id").asLong();
        postJson("/api/v1/dispatcher/plans/"+plan+"/moves",
            Map.of("expectedVersion",5,"reason","Synthetic assignment after restore","orderId",styleOrder,"toTripId",target),200);
        var published=postJson("/api/v1/dispatcher/plans/"+plan+"/publish",Map.of("expectedVersion",6,"reason","Synthetic publish"),200);
        assertThat(published.path("plan").path("status").asText()).isEqualTo("published");
        assertThat(published.path("validation").path("metrics").path("ordersAssigned").asInt()).isEqualTo(2);
        assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE status='planned'",Integer.class)).isEqualTo(2);
        assertThat(db.queryForObject("SELECT litres_committed FROM fuel_ledger WHERE vehicle_id='VEH901'",java.math.BigDecimal.class)).isEqualByComparingTo("8.00");
        var locked=postJson("/api/v1/dispatcher/plans/"+plan+"/orders/"+freshOrder+"/defer",Map.of("expectedVersion",7,"reason","Must reject"),409);
        assertThat(locked.path("code").asText()).isEqualTo("PLAN_LOCKED");
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event WHERE type='plan.published' AND actor_id IS NOT NULL",Integer.class)).isEqualTo(1);
    }
    @Test void invalidMovesDuplicateAssignmentsAndPublicationLeaveNoWrites() throws Exception {
        long plan=candidate(); var a=add(plan,0,"Fresh",1,List.of(freshOrder));
        long from=a.path("trips").get(0).path("id").asLong();
        var b=add(plan,1,"Style",2,List.of(styleOrder));
        long to=b.path("trips").get(1).path("id").asLong();
        int events=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
        var move=postJson("/api/v1/dispatcher/plans/"+plan+"/moves",Map.of("expectedVersion",2,"reason","Invalid mixed brand","orderId",freshOrder,"fromTripId",from,"toTripId",to),422);
        assertThat(move.path("violations").toString()).contains("SAME_BRAND_DISTRICT");
        assertThat(read(plan)).isEqualTo(b);
        var duplicate=postJson("/api/v1/dispatcher/plans/"+plan+"/trips",Map.of("expectedVersion",2,"reason","Duplicate order","trip",trip("Fresh",2,List.of(freshOrder))),422);
        assertThat(duplicate.path("violations").toString()).contains("WHOLE_ORDER","TRIP_COUNT");
        assertThat(read(plan)).isEqualTo(b);
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(events);
        long empty=candidate();
        var accounting=postJson("/api/v1/dispatcher/plans/"+empty+"/publish",Map.of("expectedVersion",0,"reason","Unexplained backlog"),422);
        assertThat(accounting.path("code").asText()).isEqualTo("ORDER_ACCOUNTING");
        assertThat(db.queryForObject("SELECT count(*) FROM fuel_ledger",Integer.class)).isZero();
    }
    @Test void optimisticLockAllowsOneWinnerAndDatabaseEnforcesPlanScopedUniqueness() throws Exception {
        long plan=candidate(); CountDownLatch start=new CountDownLatch(1);
        try (var workers=Executors.newFixedThreadPool(2)) {
            List<Future<Integer>> responses=new ArrayList<>();
            for (int i=0;i<2;i++) responses.add(workers.submit(() -> {
                start.await();
                return mvc.perform(post("/api/v1/dispatcher/plans/"+plan+"/trips").cookie(dispatcher).header("X-Requested-With","Waypoint")
                    .contentType("application/json").content(mapper.writeValueAsString(Map.of("expectedVersion",0,"reason","Concurrent edit","trip",trip("Fresh",1,List.of(freshOrder))))))
                    .andReturn().getResponse().getStatus();
            }));
            start.countDown();
            assertThat(List.of(responses.get(0).get(),responses.get(1).get())).containsExactlyInAnyOrder(200,409);
        }
        assertThat(db.queryForObject("SELECT count(*) FROM stop WHERE plan_id=?",Integer.class,plan)).isEqualTo(1);
        long another=candidate(); add(another,0,"Fresh",1,List.of(freshOrder));
        assertThat(db.queryForObject("SELECT count(*) FROM stop WHERE order_id=?",Integer.class,freshOrder)).isEqualTo(2);
        var stale=postJson("/api/v1/dispatcher/plans/"+plan+"/orders/"+freshOrder+"/defer",Map.of("expectedVersion",0,"reason","Stale change"),409);
        assertThat(stale.path("code").asText()).isEqualTo("STALE_PLAN");
    }
    @Test void rejectsMissingReasonsRolesScopesAndChangedInputs() throws Exception {
        long plan=candidate();
        failure(mvc.perform(get("/api/v1/dispatcher/plans/"+plan)).andReturn(),401,"UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/dispatcher/plans/"+plan).cookie(login("STM-001","synthetic-store-password"))).andReturn(),403,"FORBIDDEN");
        postJson("/api/v1/dispatcher/plans/"+plan+"/publish",Map.of("expectedVersion",0,"reason",""),400);
        for (String field : List.of("trips","dispositions")) {
            var payload=new HashMap<String,Object>(Map.of("expectedVersion",0,"reason","Invalid null member","trips",List.of(),"dispositions",List.of()));
            payload.put(field,java.util.Collections.singletonList(null));
            var result=mvc.perform(put("/api/v1/dispatcher/plans/"+plan).cookie(dispatcher)
                .header("X-Requested-With","Waypoint").contentType("application/json").content(mapper.writeValueAsString(payload))).andReturn();
            failure(result,400,"VALIDATION_FAILED");
        }
        db.update("UPDATE app_user SET depot='Kandy' WHERE username='DSP-001'");
        var scoped=login("DSP-001","synthetic-dispatcher-password");
        failure(mvc.perform(get("/api/v1/dispatcher/plans/"+plan).cookie(scoped)).andReturn(),404,"NOT_FOUND");
        db.update("UPDATE app_user SET depot=NULL WHERE username='DSP-001'");
        dispatcher=login("DSP-001","synthetic-dispatcher-password");
        db.update("UPDATE customer_order SET weight_kg=weight_kg+1,version=version+1 WHERE id=?",freshOrder);
        try {
            var drift=postJson("/api/v1/dispatcher/plans/"+plan+"/trips",Map.of("expectedVersion",0,"reason","Stale inputs","trip",trip("Fresh",1,List.of(freshOrder))),409);
            assertThat(drift.path("code").asText()).isEqualTo("SNAPSHOT_CHANGED");
            assertThat(db.queryForObject("SELECT count(*) FROM trip WHERE plan_id=?",Integer.class,plan)).isZero();
        } finally { db.update("UPDATE customer_order SET weight_kg=weight_kg-1,version=version-1 WHERE id=?",freshOrder); }
    }
    @Test void publicationReloadsPersistedAssignmentsAndRejectsCorruption() throws Exception {
        long plan=candidate(); add(plan,0,"Fresh",1,List.of(freshOrder));
        add(plan,1,"Style",2,List.of(styleOrder));
        db.update("UPDATE trip SET brand='Tech' WHERE plan_id=? AND trip_index=1",plan);
        int events=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
        var rejected=postJson("/api/v1/dispatcher/plans/"+plan+"/publish",Map.of("expectedVersion",2,"reason","Corrupt candidate must reject"),422);
        assertThat(rejected.path("violations").toString()).contains("SAME_BRAND_DISTRICT");
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?",String.class,plan)).isEqualTo("candidate");
        assertThat(db.queryForObject("SELECT count(*) FROM fuel_ledger",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(events);
    }
    @Test void auditFailureRollsBackPublishedStatusOrderStatusAndFuelReservation() throws Exception {
        long plan=candidate(); add(plan,0,"Fresh",1,List.of(freshOrder)); add(plan,1,"Style",2,List.of(styleOrder));
        int events=db.queryForObject("SELECT count(*) FROM audit_event",Integer.class);
        doThrow(new IllegalStateException("synthetic publication audit failure")).when(audit)
            .record(eq("plan.published"),any(),anyString(),anyString(),any(),any(),anyString());
        var rejected=postJson("/api/v1/dispatcher/plans/"+plan+"/publish",Map.of("expectedVersion",2,"reason","Synthetic audit failure"),500);
        assertThat(rejected.path("code").asText()).isEqualTo("INTERNAL_ERROR");
        assertThat(db.queryForObject("SELECT status FROM plan WHERE id=?",String.class,plan)).isEqualTo("candidate");
        assertThat(db.queryForObject("SELECT count(*) FROM customer_order WHERE status='planned'",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM fuel_ledger",Integer.class)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM audit_event",Integer.class)).isEqualTo(events);
    }
    @Test void clientMetricsCannotOverrideCalculatedTimeAndFuelAndTripIdsRemainStable() throws Exception {
        long plan=candidate();
        var payload=new HashMap<String,Object>(trip("Fresh",1,List.of(freshOrder)));
        payload.put("tripMinutes",1); payload.put("fuelLitres",0); payload.put("distanceKm",0);
        var first=postJson("/api/v1/dispatcher/plans/"+plan+"/trips",Map.of("expectedVersion",0,"reason","Untrusted client metrics","trip",payload),200);
        assertThat(first.path("trips").get(0).path("tripMinutes").asInt()).isEqualTo(31);
        assertThat(first.path("trips").get(0).path("fuelLitres").decimalValue()).isEqualByComparingTo("4.00");
        long tid=first.path("trips").get(0).path("id").asLong();
        var changed=postJson("/api/v1/dispatcher/plans/"+plan+"/trips/"+tid+"/vehicle",Map.of("expectedVersion",1,"reason","Choose second slot","vehicleId","VEH901","tripIndex",2),200);
        assertThat(changed.path("trips").get(0).path("id").asLong()).isEqualTo(tid);
        assertThat(changed.path("vehicleUtilisation").path("VEH901").path("freshMinutesLimit").asInt()).isEqualTo(270);
    }
}
