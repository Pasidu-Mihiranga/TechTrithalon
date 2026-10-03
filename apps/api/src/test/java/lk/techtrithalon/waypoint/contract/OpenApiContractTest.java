package lk.techtrithalon.waypoint.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Contract-drift gate. The committed apps/api/openapi.json is the source the web client is
 * generated from; this fails when the running API no longer matches it.
 * Regenerate with: ./gradlew test --tests '*OpenApiContractTest' -PupdateOpenApi
 */
@SpringBootTest(properties = {
    "spring.autoconfigure.exclude="
        + "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.jdbc.JdbcTemplateAutoConfiguration,"
        + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration",
    "app.reference.seed-on-startup=false",
    "app.demo.seed-on-startup=false",
    "app.security.seed.enabled=false",
    "springdoc.writer-with-order-by-keys=true",
})
@AutoConfigureMockMvc
class OpenApiContractTest {
    @Autowired MockMvc mvc;
    @MockitoBean JdbcTemplate jdbcTemplate;
    @MockitoBean org.springframework.transaction.support.TransactionTemplate transactionTemplate;

    @Test
    void committedSpecMatchesTheRunningApi() throws Exception {
        String raw = mvc.perform(get("/v3/api-docs")).andReturn().getResponse().getContentAsString();
        ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        String actual = mapper.writerWithDefaultPrettyPrinter()
            .writeValueAsString(mapper.readValue(raw, Object.class)) + "\n";

        Path committed = Path.of(System.getProperty("openapi.file"));
        if (Boolean.getBoolean("openapi.update") || !Files.exists(committed)) {
            Files.writeString(committed, actual);
            return;
        }
        assertThat(actual)
            .as("openapi.json is out of date — rerun with -PupdateOpenApi, then `pnpm --dir apps/web generate:api`")
            .isEqualTo(Files.readString(committed));
    }
}
