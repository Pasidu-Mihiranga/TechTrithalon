package lk.techtrithalon.waypoint.system;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;

class SystemControllerTest {
    @Test
    void reportsIntelligenceWhenReachableAndKeepsApiAvailableWhenItIsDown() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange -> {
            byte[] body = "{\"status\":\"ok\"}".getBytes();
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        var controller = new SystemController("http://127.0.0.1:" + server.getAddress().getPort());
        try {
            assertThat(controller.health()).isEqualTo(new SystemHealth("api", "ok", "reachable"));
        } finally {
            server.stop(0);
        }
        assertThat(controller.health()).isEqualTo(new SystemHealth("api", "ok", "unavailable"));
    }

    @Test
    void reportsUnavailableWhenIntelligenceReturnsAnError() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        try {
            var controller = new SystemController("http://127.0.0.1:" + server.getAddress().getPort());
            assertThat(controller.health().intelligence()).isEqualTo("unavailable");
        } finally {
            server.stop(0);
        }
    }
}
