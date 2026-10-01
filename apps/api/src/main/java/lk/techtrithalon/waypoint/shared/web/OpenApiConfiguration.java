package lk.techtrithalon.waypoint.shared.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** A fixed server entry keeps the generated spec byte-stable, which the contract-drift test relies on. */
@Configuration
public class OpenApiConfiguration {
    @Bean
    public OpenAPI waypointOpenApi() {
        return new OpenAPI()
            .info(new Info().title("TechTrithalon — Waypoint Operations API").version("v1"))
            .servers(List.of(new Server().url("/")));
    }
}
