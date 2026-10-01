package lk.techtrithalon.waypoint.reference;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reference")
public class ReferenceController {
    private final JdbcTemplate db;
    private final ReferenceProperties properties;

    public ReferenceController(JdbcTemplate db, ReferenceProperties properties) {
        this.db = db;
        this.properties = properties;
    }

    @GetMapping("/summary")
    public ReferenceSummary summary() {
        return new ReferenceSummary(
            count("outlet"), count("vehicle"), count("calendar_day"),
            count("district_travel"), count("service_allowance"),
            properties.demoOperatingDate());
    }

    private int count(String table) {
        Integer n = db.queryForObject("SELECT count(*) FROM " + table, Integer.class);
        return n == null ? 0 : n;
    }
}
