package lk.techtrithalon.waypoint;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class WaypointApplication {
    public static void main(String[] args) {
        SpringApplication.run(WaypointApplication.class, args);
    }
}
