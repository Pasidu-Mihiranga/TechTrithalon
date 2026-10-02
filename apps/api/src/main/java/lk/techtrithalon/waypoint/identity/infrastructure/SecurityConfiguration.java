package lk.techtrithalon.waypoint.identity.infrastructure;

import lk.techtrithalon.waypoint.identity.application.AuthService;
import lk.techtrithalon.waypoint.identity.application.SecurityProperties;
import lk.techtrithalon.waypoint.identity.domain.Role;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Layer 1 of access control: which role may reach which route family. Layer 2 is method security
 * ({@code @PreAuthorize}) on application services; layer 3 is the data-scope check inside the service
 * (see {@code CurrentUser.canAccessOutlet}), which answers 404 rather than 403.
 */
@Configuration
@org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication
@EnableMethodSecurity
@EnableScheduling
class SecurityConfiguration {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, AuthService auth, SecurityProperties properties,
                                    ApiSecurityHandlers handlers) throws Exception {
        http
            .cors(Customizer.withDefaults())
            // Spring's built-in CSRF needs an HttpSession; ours is CsrfGuardFilter (header + Origin check).
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .httpBasic(AbstractHttpConfigurer::disable)
            .formLogin(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .exceptionHandling(e -> e.authenticationEntryPoint(handlers).accessDeniedHandler(handlers))
            .addFilterBefore(new CsrfGuardFilter(properties.allowedOrigins(), handlers), BasicAuthenticationFilter.class)
            .addFilterBefore(new SessionAuthenticationFilter(auth, properties), AnonymousAuthenticationFilter.class)
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/system/health", "/actuator/health/**", "/actuator/health", "/v3/api-docs/**").permitAll()
                .requestMatchers("/api/v1/auth/**").authenticated()
                .requestMatchers("/api/v1/reference/**").hasAnyRole(Role.DISPATCHER.name(), Role.STORE_MANAGER.name())
                .requestMatchers("/api/v1/dispatcher/**").hasRole(Role.DISPATCHER.name())
                .requestMatchers("/api/v1/store/**").hasRole(Role.STORE_MANAGER.name())
                .requestMatchers("/api/v1/loader/**").hasRole(Role.LOADER.name())
                .requestMatchers("/api/v1/driver/**").hasRole(Role.DRIVER.name())
                // Anything not listed above needs a signed-in user: new routes are closed by default.
                .anyRequest().authenticated());
        return http.build();
    }
}
