package lk.techtrithalon.waypoint.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import lk.techtrithalon.waypoint.identity.application.AuthService;
import lk.techtrithalon.waypoint.identity.application.LoginThrottle;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Full security chain and migrations against PostgreSQL. All identities/resources are synthetic. */
@Testcontainers
@SpringBootTest(properties = {
    "app.security.bcrypt-cost=4", "app.security.cookie-secure=true",
    "app.security.seed.dispatcher.password=synthetic-dispatcher-password",
    "app.security.seed.store-manager.password=synthetic-store-password",
    "app.security.seed.store-manager.outlet-id=OUT901",
    "app.security.seed.loader.password=synthetic-loader-password",
    "app.security.seed.driver.password=synthetic-driver-password",
    "app.security.seed.driver.vehicle-id=VEH901"
})
@AutoConfigureMockMvc
@Import(IdentitySecurityIT.Probes.class)
class IdentitySecurityIT {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.reference.data-dir", () -> {
            try { return Path.of(Objects.requireNonNull(IdentitySecurityIT.class.getResource("/reference-fixture")).toURI()).toString(); }
            catch (Exception e) { throw new IllegalStateException(e); }
        });
        registry.add("app.reference.expected.outlets", () -> 3);
        registry.add("app.reference.expected.vehicles", () -> 2);
        registry.add("app.reference.expected.calendar-days", () -> 5);
        registry.add("app.reference.expected.districts", () -> 2);
        registry.add("app.reference.expected.service-allowances", () -> 9);
        registry.add("app.demo.data-dir", () -> {
            try { return Path.of(Objects.requireNonNull(IdentitySecurityIT.class.getResource("/demo-fixture")).toURI()).toString(); }
            catch (Exception e) { throw new IllegalStateException(e); }
        });
        registry.add("app.demo.expected-orders", () -> 2);
        registry.add("app.demo.expected-fleet-rows", () -> 1);
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper mapper;
    @Autowired MutableClock clock;
    @Autowired LoginThrottle throttle;
    @Autowired IdentitySeeder seeder;
    @Autowired PasswordEncoder encoder;
    @Autowired AuthService auth;

    @BeforeEach
    void reset() {
        db.update("DELETE FROM user_session");
        db.update("DELETE FROM app_user WHERE username = 'SYN-OTHER-DRIVER'");
        db.update("UPDATE app_user SET active = true");
        clock.instant = Instant.parse("2026-06-26T00:00:00Z");
        // Age every failure bucket out, then return to the fixed business time.
        clock.instant = clock.instant.plusSeconds(100_000);
        throttle.purge();
        clock.instant = Instant.parse("2026-06-26T00:00:00Z");
    }

    private Cookie login(String username, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint")
                .header("Origin", "http://localhost:5173").contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("username", username, "password", password, "rememberMe", true))))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.passwordHash").doesNotExist()).andReturn();
        Cookie cookie = result.getResponse().getCookie("WP_SESSION");
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("SameSite=Lax", "Max-Age=57600");
        return cookie;
    }

    private void failure(MvcResult result, int status, String code) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(status);
        var body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("traceId").asText()).isNotBlank().isEqualTo(result.getResponse().getHeader("X-Request-Id"));
        assertThat(body.toString()).doesNotContain("password_hash", "SQLException", "java.lang", "stackTrace");
    }

    @Test
    void fourAccountsSeedIdempotentlyWithHashedPasswords() throws Exception {
        seeder.run(new DefaultApplicationArguments());
        assertThat(db.queryForObject("SELECT count(*) FROM app_user", Integer.class)).isEqualTo(4);
        assertThat(encoder.matches("synthetic-dispatcher-password", db.queryForObject("SELECT password_hash FROM app_user WHERE username='DSP-001'", String.class))).isTrue();
        assertThat(db.queryForList("SELECT password_hash FROM app_user", String.class)).allMatch(hash -> hash.startsWith("$2a$"));
    }

    @Test
    void roleMatrixAndMethodSecurityRejectEveryOtherRole() throws Exception {
        String[] users = { "DSP-001", "STM-001", "LDR-001", "DRV-001" };
        String[] passwords = { "synthetic-dispatcher-password", "synthetic-store-password", "synthetic-loader-password", "synthetic-driver-password" };
        String[] paths = { "dispatcher", "store", "loader", "driver" };
        for (int i = 0; i < users.length; i++) {
            Cookie cookie = login(users[i], passwords[i]);
            mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andExpect(status().isOk()).andExpect(jsonPath("$.username").value(users[i]));
            for (int j = 0; j < paths.length; j++) {
                MvcResult result = mvc.perform(get("/api/v1/" + paths[j] + "/probe").cookie(cookie)).andReturn();
                if (i == j) assertThat(result.getResponse().getStatus()).isEqualTo(200);
                else failure(result, 403, "FORBIDDEN");
            }
            MvcResult method = mvc.perform(get("/api/v1/auth/dispatcher-probe").cookie(cookie)).andReturn();
            if (i == 0) assertThat(method.getResponse().getStatus()).isEqualTo(200);
            else failure(method, 403, "FORBIDDEN");
            MvcResult reference = mvc.perform(get("/api/v1/reference/summary").cookie(cookie)).andReturn();
            if (i < 2) assertThat(reference.getResponse().getStatus()).isEqualTo(200);
            else failure(reference, 403, "FORBIDDEN");
        }
        failure(mvc.perform(get("/api/v1/auth/me")).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(get("/api/v1/dispatcher/probe")).andReturn(), 401, "UNAUTHENTICATED");
    }

    @Test
    void ownedOutletDepotAndDriverResourcesHideOtherOwners() throws Exception {
        Cookie store = login("STM-001", "synthetic-store-password");
        mvc.perform(get("/api/v1/store/outlets/OUT901").cookie(store)).andExpect(status().isOk());
        failure(mvc.perform(get("/api/v1/store/outlets/OUT902").cookie(store)).andReturn(), 404, "NOT_FOUND");
        failure(mvc.perform(get("/api/v1/store/outlets/UNKNOWN").cookie(store)).andReturn(), 404, "NOT_FOUND");
        Cookie loader = login("LDR-001", "synthetic-loader-password");
        mvc.perform(get("/api/v1/loader/depots/Peliyagoda").cookie(loader)).andExpect(status().isOk());
        failure(mvc.perform(get("/api/v1/loader/depots/Kandy").cookie(loader)).andReturn(), 404, "NOT_FOUND");
        Cookie driver = login("DRV-001", "synthetic-driver-password");
        mvc.perform(get("/api/v1/driver/probe-trips/901").cookie(driver)).andExpect(status().isOk());
        failure(mvc.perform(get("/api/v1/driver/probe-trips/902").cookie(driver)).andReturn(), 404, "NOT_FOUND");
        db.update("INSERT INTO app_user (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
            "SYN-OTHER-DRIVER", "Synthetic other driver", encoder.encode("synthetic-other-password"), "DRIVER");
        Cookie otherDriver = login("SYN-OTHER-DRIVER", "synthetic-other-password");
        failure(mvc.perform(get("/api/v1/driver/probe-trips/901").cookie(otherDriver)).andReturn(), 404, "NOT_FOUND");
        var scoped = new CurrentUser(901, "synthetic", "Synthetic", Role.DISPATCHER, null, "Kandy");
        assertThat(scoped.canAccessOutlet("OUT901", "Peliyagoda")).isFalse();
        assertThat(scoped.canAccessOutlet("OUT901", "Kandy")).isTrue();
    }

    @Test
    void opaqueTokenIsHashedAndLogoutRevokesItImmediately() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(get("/api/v1/auth/does-not-exist").cookie(cookie)).andReturn(), 404, "NOT_FOUND");
        assertThat(db.queryForObject("SELECT token_hash FROM user_session", String.class)).hasSize(64).isNotEqualTo(cookie.getValue());
        mvc.perform(post("/api/v1/auth/logout").cookie(cookie).header("X-Requested-With", "Waypoint"))
            .andExpect(status().isNoContent()).andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));
        failure(mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andReturn(), 401, "UNAUTHENTICATED");
        assertThat(auth.resolve(cookie.getValue())).isEmpty();
    }

    @Test
    void expiryAndAccountDeactivationInvalidateSessions() throws Exception {
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        clock.instant = clock.instant.plusSeconds(57_600);
        failure(mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andReturn(), 401, "UNAUTHENTICATED");
        clock.instant = clock.instant.minusSeconds(57_600);
        db.update("UPDATE app_user SET active=false WHERE username='DSP-001'");
        failure(mvc.perform(get("/api/v1/auth/me").cookie(cookie)).andReturn(), 401, "UNAUTHENTICATED");
        failure(mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"username\":\"DSP-001\",\"password\":\"synthetic-dispatcher-password\"}")).andReturn(), 401, "INVALID_CREDENTIALS");
    }

    @Test
    void csrfAndCorsRejectUntrustedOriginsAndMissingHeaders() throws Exception {
        String body = "{\"username\":\"DSP-001\",\"password\":\"synthetic-dispatcher-password\"}";
        failure(mvc.perform(post("/api/v1/auth/login").contentType("application/json").content(body)).andReturn(), 403, "CSRF_REJECTED");
        Cookie cookie = login("DSP-001", "synthetic-dispatcher-password");
        failure(mvc.perform(post("/api/v1/auth/logout").cookie(cookie)).andReturn(), 403, "CSRF_REJECTED");
        // CORS rejects before CSRF for browser cross-origin calls.
        failure(mvc.perform(post("/api/v1/auth/logout").cookie(cookie).header("X-Requested-With", "Waypoint")
            .header("Origin", "https://untrusted.invalid")).andReturn(), 403, "CORS_REJECTED");
        mvc.perform(options("/api/v1/auth/login").header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-Requested-With,Content-Type"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        assertThat(auth.resolve(cookie.getValue())).isPresent();
    }

    @Test
    void badInputCredentialsAndThrottleReturnStableErrors() throws Exception {
        failure(mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json").content("{}"))
            .andReturn(), 400, "VALIDATION_FAILED");
        failure(mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json")
            .content(mapper.writeValueAsString(Map.of("username", "missing", "password", "☃".repeat(25)))))
            .andReturn(), 400, "VALIDATION_FAILED");
        for (int i = 0; i < 5; i++) {
            failure(mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json")
                .content("{\"username\":\"missing\",\"password\":\"wrong\"}")).andReturn(), 401, "INVALID_CREDENTIALS");
        }
        MvcResult limited = mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"username\":\"different\",\"password\":\"wrong\"}")).andReturn();
        failure(limited, 429, "TOO_MANY_ATTEMPTS");
        assertThat(limited.getResponse().getHeader("Retry-After")).isEqualTo("900");
        assertThat(throttle.retryAfter("MISSING", "another-address").toSeconds()).isEqualTo(900);
        clock.instant = clock.instant.plusSeconds(900);
        assertThat(throttle.retryAfter("missing", "127.0.0.1")).isZero();
    }

    @Test
    void uncheckedRememberMeUsesABrowserSessionCookie() throws Exception {
        mvc.perform(post("/api/v1/auth/login").header("X-Requested-With", "Waypoint").contentType("application/json")
            .content("{\"username\":\"DSP-001\",\"password\":\"synthetic-dispatcher-password\",\"rememberMe\":false}"))
            .andExpect(status().isOk()).andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Max-Age"))));
    }

    static class MutableClock extends Clock {
        Instant instant = Instant.parse("2026-06-26T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Colombo"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return instant; }
    }

    @TestConfiguration
    static class Probes {
        @Bean @Primary MutableClock mutableClock() { return new MutableClock(); }
        @Bean ProbeController probeController() { return new ProbeController(); }
        @Bean ProbeService probeService() { return new ProbeService(); }
    }

    /** Test-only endpoints verify the security boundaries without adding future-phase features. */
    @RestController @TestComponent
    static class ProbeController {
        @Autowired ProbeService service;
        @Autowired JdbcTemplate db;
        @GetMapping({"/api/v1/dispatcher/probe", "/api/v1/store/probe", "/api/v1/loader/probe", "/api/v1/driver/probe"})
        Map<String, Object> probe(@AuthenticationPrincipal CurrentUser user) { return Map.of("actorId", user.id(), "role", user.role()); }
        @GetMapping("/api/v1/auth/dispatcher-probe") Map<String, String> method() { return service.dispatcher(); }
        @GetMapping("/api/v1/store/outlets/{id}") Map<String, String> outlet(@PathVariable String id, @AuthenticationPrincipal CurrentUser user) { return service.outlet(id, user); }
        @GetMapping("/api/v1/loader/depots/{depot}") Map<String, String> depot(@PathVariable String depot, @AuthenticationPrincipal CurrentUser user) {
            if (!user.canAccessDepot(depot)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            return Map.of("depot", depot);
        }
        @GetMapping("/api/v1/driver/probe-trips/{id}") Map<String, Long> trip(@PathVariable long id, @AuthenticationPrincipal CurrentUser user) {
            if (id != 901 || user.id() != db.queryForObject("SELECT id FROM app_user WHERE username='DRV-001'", Long.class)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            return Map.of("tripId", id, "actorId", user.id());
        }
    }
    static class ProbeService {
        @PreAuthorize("hasRole('DISPATCHER')") public Map<String, String> dispatcher() { return Map.of("role", "dispatcher"); }
        @PreAuthorize("hasRole('STORE_MANAGER')") public Map<String, String> outlet(String id, CurrentUser user) {
            if (!user.canAccessOutlet(id)) throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            return Map.of("outletId", id);
        }
    }
}
