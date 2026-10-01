package lk.techtrithalon.waypoint.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lk.techtrithalon.waypoint.identity.application.AuthService;
import lk.techtrithalon.waypoint.identity.application.SecurityProperties;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Turns the session cookie into the signed-in user for this request. No session means no authentication. */
class SessionAuthenticationFilter extends OncePerRequestFilter {
    private final AuthService auth;
    private final String cookieName;

    SessionAuthenticationFilter(AuthService auth, SecurityProperties properties) {
        this.auth = auth;
        this.cookieName = properties.cookieName();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String token = tokenFrom(request);
        if (token != null) {
            auth.resolve(token).ifPresent(user -> authenticate(user, request));
        }
        chain.doFilter(request, response);
    }

    private static void authenticate(CurrentUser user, HttpServletRequest request) {
        var authentication = new UsernamePasswordAuthenticationToken(user, null, List.of(new SimpleGrantedAuthority(user.role().authority())));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private String tokenFrom(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) if (cookieName.equals(c.getName())) return c.getValue();
        return null;
    }
}
