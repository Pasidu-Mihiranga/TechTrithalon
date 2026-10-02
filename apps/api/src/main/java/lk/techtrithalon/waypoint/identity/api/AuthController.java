package lk.techtrithalon.waypoint.identity.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import lk.techtrithalon.waypoint.identity.application.AuthService;
import lk.techtrithalon.waypoint.identity.application.SecurityProperties;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {
    private final AuthService auth;
    private final SecurityProperties properties;

    AuthController(AuthService auth, SecurityProperties properties) {
        this.auth = auth;
        this.properties = properties;
    }

    @PostMapping("/login")
    ResponseEntity<UserResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        AuthService.LoginResult result = auth.login(request.username().trim(), request.password(), http.getRemoteAddr());
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, sessionCookie(result.token(), request.rememberMe() ? properties.sessionTtl() : null).toString())
            // The response depends on the cookie; never let an intermediary cache it.
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(UserResponse.from(result.user()));
    }

    @SecurityRequirement(name = "session")
    @GetMapping("/me")
    ResponseEntity<UserResponse> me(@AuthenticationPrincipal CurrentUser user) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(UserResponse.from(user));
    }

    @SecurityRequirement(name = "session")
    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest http) {
        auth.logout(cookieValue(http));
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, sessionCookie("", Duration.ZERO).toString())
            .build();
    }

    private ResponseCookie sessionCookie(String value, Duration maxAge) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(properties.cookieName(), value)
            .httpOnly(true)
            .secure(properties.cookieSecure())
            .sameSite("Lax")
            .path("/");
        if (maxAge != null) builder.maxAge(maxAge);
        return builder.build();
    }

    private String cookieValue(HttpServletRequest http) {
        Cookie[] cookies = http.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) if (properties.cookieName().equals(c.getName())) return c.getValue();
        return null;
    }
}
