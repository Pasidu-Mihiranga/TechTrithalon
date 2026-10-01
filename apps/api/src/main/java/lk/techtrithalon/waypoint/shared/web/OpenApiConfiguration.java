package lk.techtrithalon.waypoint.shared.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.security.SecurityScheme;
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
            .components(new Components().addSecuritySchemes("session",
                new SecurityScheme()
                    .type(SecurityScheme.Type.APIKEY)
                    .in(SecurityScheme.In.COOKIE).name("WP_SESSION")))
            .servers(List.of(new Server().url("/")));
    }
}
