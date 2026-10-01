package lk.techtrithalon.waypoint.system;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@RestController
@RequestMapping("/api/v1/system")
public class SystemController {
    private final RestClient intelligence;

    public SystemController(@Value("${app.intelligence-base-url}") String baseUrl) {
        var requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(2));
        requestFactory.setReadTimeout(Duration.ofSeconds(2));
        this.intelligence = RestClient.builder().baseUrl(baseUrl).requestFactory(requestFactory).build();
    }

    @GetMapping("/health")
    public SystemHealth health() {
        String intelligenceStatus;
        try {
            intelligence.get().uri("/health").retrieve().toBodilessEntity();
            intelligenceStatus = "reachable";
        } catch (RuntimeException e) {
            // The operational API must stay available when the Python service is down.
            intelligenceStatus = "unavailable";
        }
        return new SystemHealth("api", "ok", intelligenceStatus);
    }
}
