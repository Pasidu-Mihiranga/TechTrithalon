package lk.techtrithalon.waypoint.reference.infrastructure;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.nio.file.Path;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@SpringBootTest(properties = {
    "app.demo.clock-instant=2026-06-25T11:00:00Z",
    "app.security.bcrypt-cost=4", "app.security.cookie-secure=true",
    "app.security.seed.dispatcher.password=synthetic-dispatcher-password",
    "app.security.seed.store-manager.password=synthetic-store-password",
    "app.security.seed.store-manager.outlet-id=OUT901",
    "app.security.seed.loader.password=synthetic-loader-password",
    "app.security.seed.driver.password=synthetic-driver-password",
    "app.security.seed.driver.vehicle-id=VEH901"
})
@AutoConfigureMockMvc
public abstract class ReferenceApiTestSupport {
    @Container @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.reference.data-dir", () -> {
            try { return Path.of(Objects.requireNonNull(ReferenceApiTestSupport.class.getResource("/reference-fixture")).toURI()).toString(); }
            catch (Exception e) { throw new IllegalStateException(e); }
        });
        registry.add("app.reference.expected.outlets", () -> 3);
        registry.add("app.reference.expected.vehicles", () -> 2);
        registry.add("app.reference.expected.calendar-days", () -> 5);
        registry.add("app.reference.expected.districts", () -> 2);
        registry.add("app.reference.expected.service-allowances", () -> 9);
        registry.add("app.demo.data-dir", () -> {
            try { return Path.of(Objects.requireNonNull(ReferenceApiTestSupport.class.getResource("/demo-fixture")).toURI()).toString(); }
            catch (Exception e) { throw new IllegalStateException(e); }
        });
        registry.add("app.demo.expected-orders", () -> 2);
        registry.add("app.demo.expected-fleet-rows", () -> 1);
    }


    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate db;
    @Autowired protected ObjectMapper mapper;
    protected Cookie login(String username, String password) throws Exception {
        var result=mvc.perform(post("/api/v1/auth/login").header("X-Requested-With","Waypoint")
            .contentType("application/json").content(mapper.writeValueAsString(Map.of("username",username,"password",password))))
            .andExpect(status().isOk()).andReturn();
        return result.getResponse().getCookie("WP_SESSION");
    }
    protected void failure(MvcResult result,int status,String code) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(status);
        var body=mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.path("code").asText()).isEqualTo(code);
        assertThat(body.path("traceId").asText()).isNotBlank().isEqualTo(result.getResponse().getHeader("X-Request-Id"));
        assertThat(body.toString()).doesNotContain("SQLException","java.lang","stackTrace");
    }
}
