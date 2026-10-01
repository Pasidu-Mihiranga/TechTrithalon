package lk.techtrithalon.waypoint.reference;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Seeds the real supplied dataset and checks the invariants the rest of the system relies on.
 * Runs only where the dataset exists locally — it is never committed, so CI skips this test.
 */
@Testcontainers(disabledWithoutDocker = true)
@EnabledIf("datasetPresent")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "app.security.seed.enabled=false")
@Import(PostgresTestSupport.class)
class RealDatasetSeedIT {
    static boolean datasetPresent() {
        String dir = System.getProperty("reference.dataset.dir");
        return dir != null && Files.isRegularFile(Path.of(dir, "outlets.csv"));
    }

    @DynamicPropertySource
    static void datasetProperties(DynamicPropertyRegistry registry) {
        registry.add("app.reference.data-dir", () -> System.getProperty("reference.dataset.dir"));
    }

    @Autowired JdbcTemplate db;

    @Test
    void realDatasetMatchesDocumentedInvariants() {
        // Row counts, the demo operating date and the mall-window intersections are already
        // enforced by the seeder at startup; these are the distributions planning depends on.
        assertThat(count("outlet WHERE brand = 'Fresh'")).isEqualTo(80);
        assertThat(count("outlet WHERE brand = 'Style'")).isEqualTo(25);
        assertThat(count("outlet WHERE brand = 'Tech'")).isEqualTo(15);
        assertThat(count("outlet WHERE parking_constraint = 'van_only'")).isEqualTo(13);
        assertThat(count("outlet WHERE mall_window_open IS NOT NULL")).isEqualTo(12);
        assertThat(count("outlet")).isEqualTo(120);
        assertThat(count("vehicle")).isEqualTo(60);
        assertThat(count("district_travel")).isEqualTo(12);
        assertThat(count("vehicle WHERE type = 'truck' AND temp = 'reefer'")).isEqualTo(12);
        assertThat(count("vehicle WHERE type = 'truck' AND temp = 'ambient'")).isEqualTo(40);
        assertThat(count("vehicle WHERE type = 'van' AND temp = 'ambient'")).isEqualTo(4);
        assertThat(count("vehicle WHERE temp = 'reefer'")).isEqualTo(16);
        assertThat(count("vehicle WHERE type = 'van'")).isEqualTo(8);
        assertThat(count("vehicle WHERE type = 'van' AND temp = 'reefer'")).isEqualTo(4);
        assertThat(count("vehicle WHERE depot = 'Peliyagoda'")).isEqualTo(38);
        assertThat(count("calendar_day WHERE is_operating")).isEqualTo(770);
        // District → depot is a fixed 1:1 mapping; outlets always sit in their district's depot.
        assertThat(count("outlet o JOIN district_travel d USING (district) WHERE o.depot <> d.depot")).isZero();
    }

    private int count(String fromAndWhere) {
        return db.queryForObject("SELECT count(*) FROM " + fromAndWhere, Integer.class);
    }
}
