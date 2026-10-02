package lk.techtrithalon.waypoint.shared.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.cors.DefaultCorsProcessor;
import org.springframework.web.filter.CorsFilter;
import org.slf4j.MDC;
import java.util.List;
import lk.techtrithalon.waypoint.identity.application.SecurityProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Browser access rules. Only the configured web origins may call the API, and only they may send the
 * session cookie ({@code allowCredentials}); there is no wildcard.
 */
@Configuration
public class WebConfiguration {
    @Bean
    CorsFilter corsFilter(@Qualifier("corsConfigurationSource") CorsConfigurationSource source,
                          ObjectMapper mapper) {
        var filter = new CorsFilter(source);
        filter.setCorsProcessor(new DefaultCorsProcessor() {
            @Override
            protected void rejectRequest(ServerHttpResponse response) throws IOException {
                var problem = ProblemDetail.forStatusAndDetail(
                    HttpStatus.FORBIDDEN, "The request origin is not allowed");
                problem.setProperty("code", "CORS_REJECTED");
                problem.setProperty("traceId", MDC.get(RequestIdFilter.MDC_KEY));
                response.setStatusCode(HttpStatus.FORBIDDEN);
                response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
                mapper.writeValue(response.getBody(), problem);
            }
        });
        return filter;
    }

    @Bean
    FilterRegistrationBean<CorsFilter> corsRegistration(
            CorsFilter filter) {
        var registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false); // The security chain runs it after the request-id filter.
        return registration;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(SecurityProperties security) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(security.allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-Requested-With", RequestIdFilter.HEADER));
        cors.setExposedHeaders(List.of(RequestIdFilter.HEADER, "Retry-After"));
        cors.setAllowCredentials(true);
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
}
