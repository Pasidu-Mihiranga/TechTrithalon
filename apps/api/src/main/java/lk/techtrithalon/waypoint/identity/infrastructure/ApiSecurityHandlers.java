package lk.techtrithalon.waypoint.identity.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lk.techtrithalon.waypoint.shared.web.RequestIdFilter;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/** 401 and 403 from the security filters, in the same problem shape as every other API error. */
@Component
class ApiSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {
    private final ObjectMapper mapper;

    ApiSecurityHandlers(ObjectMapper mapper) { this.mapper = mapper; }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) throws IOException {
        write(request, response, 401, "Unauthorized", "UNAUTHENTICATED", "Sign in to continue");
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws IOException {
        write(request, response, 403, "Forbidden", "FORBIDDEN", "Your role does not have access to this resource");
    }

    void write(HttpServletRequest request, HttpServletResponse response, int status, String title, String code, String detail) throws IOException {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status), detail);
        problem.setTitle(title);
        problem.setInstance(java.net.URI.create(request.getRequestURI()));
        problem.setProperty("code", code);
        problem.setProperty("traceId", MDC.get(RequestIdFilter.MDC_KEY));
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(), problem);
    }
}
