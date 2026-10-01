package lk.techtrithalon.waypoint.identity.infrastructure;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * CSRF defence for cookie sessions, layered on top of {@code SameSite=Lax}:
 * <ul>
 *   <li>every state-changing request must carry {@code X-Requested-With}, a header a cross-site form
 *       or image cannot add, and one a cross-origin script can only add after a CORS preflight that
 *       only allowed origins pass;</li>
 *   <li>if the browser sends an {@code Origin}, it must be one of the allowed origins.</li>
 * </ul>
 */
class CsrfGuardFilter extends OncePerRequestFilter {
    static final String HEADER = "X-Requested-With";
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private final List<String> allowedOrigins;
    private final ApiSecurityHandlers handlers;

    CsrfGuardFilter(List<String> allowedOrigins, ApiSecurityHandlers handlers) {
        this.allowedOrigins = allowedOrigins;
        this.handlers = handlers;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return SAFE_METHODS.contains(request.getMethod()) || !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String origin = request.getHeader("Origin");
        boolean originOk = origin == null || allowedOrigins.contains(origin);
        boolean headerOk = request.getHeader(HEADER) != null;
        if (!originOk || !headerOk) {
            handlers.write(request, response, 403, "Forbidden", "CSRF_REJECTED", "The request was rejected as a possible cross-site request");
            return;
        }
        chain.doFilter(request, response);
    }
}
