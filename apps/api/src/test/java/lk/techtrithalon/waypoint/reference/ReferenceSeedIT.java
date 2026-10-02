package lk.techtrithalon.waypoint.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Objects;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Empty database → Flyway → seed → seed again, against real PostgreSQL, using synthetic fixtures. */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
    "app.security.seed.enabled=false",
    "app.demo.seed-on-startup=false"
})
@Import(PostgresTestSupport.class)
class ReferenceSeedIT {
    static Path fixture(String name) throws Exception {
        return Path.of(Objects.requireNonNull(ReferenceSeedIT.class.getResource("/" + name)).toURI());
    }

    @DynamicPropertySource
    static void fixtureProperties(DynamicPropertyRegistry registry) throws Exception {
        registry.add("app.reference.data-dir", () -> fixtureDir("reference-fixture"));
        registry.add("app.reference.expected.outlets", () -> 3);
        registry.add("app.reference.expected.vehicles", () -> 2);
        registry.add("app.reference.expected.calendar-days", () -> 3);
        registry.add("app.reference.expected.districts", () -> 2);
        registry.add("app.reference.expected.service-allowances", () -> 9);
    }

    static String fixtureDir(String name) {
        try { return fixture(name).toString(); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    @Autowired JdbcTemplate db;
    @Autowired TransactionTemplate tx;
    @Autowired ReferenceDataSeeder seeder;
    @Autowired ReferenceProperties properties;

    @Test
    void migratesEmptyDatabaseAndSeedsIdempotently() {
        // The seeder already ran once at startup against a freshly migrated database.
        assertThat(db.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class))
            .isGreaterThanOrEqualTo(1);
        assertCounts(3, 2, 3, 2, 9);

        seeder.seed();
        seeder.seed();

        assertCounts(3, 2, 3, 2, 9);
    }

    @Test
    void storesMallWindowAsTwoTimeColumns() {
        var row = db.queryForMap("SELECT mall_window_open::text o, mall_window_close::text c FROM outlet WHERE outlet_id = 'OUT902'");
        assertThat(row).containsEntry("o", "10:00:00").containsEntry("c", "12:00:00");
        assertThat(db.queryForObject("SELECT mall_window_open FROM outlet WHERE outlet_id = 'OUT901'", Object.class)).isNull();
    }

    @Test
    void failedImportRollsBackEverything() {
        db.execute("TRUNCATE customer_order, audit_event, vehicle_availability, fuel_ledger, user_session, app_user, outlet, vehicle, calendar_day, service_allowance, district_travel");
        var bad = new ReferenceProperties(fixtureDir("reference-fixture-bad"), true,
            properties.demoOperatingDate(), properties.expected());

        assertThatThrownBy(() -> new ReferenceDataSeeder(db, tx, bad).seed())
            .hasMessageContaining("Empty effective delivery window for OUT902");
        // district_travel was imported before the bad outlet; it must have been rolled back too.
        assertCounts(0, 0, 0, 0, 0);

        seeder.seed();
        assertCounts(3, 2, 3, 2, 9);
    }

    @Test
    void rejectsADemoDateThatIsNotAnOperatingDay() {
        var sunday = new ReferenceProperties(properties.dataDir(), true, LocalDate.of(2026, 6, 28), properties.expected());
        assertThatThrownBy(() -> new ReferenceDataSeeder(db, tx, sunday).seed())
            .hasMessageContaining("is not an operating day");
    }

    private void assertCounts(int outlets, int vehicles, int days, int districts, int allowances) {
        assertThat(count("outlet")).isEqualTo(outlets);
        assertThat(count("vehicle")).isEqualTo(vehicles);
        assertThat(count("calendar_day")).isEqualTo(days);
        assertThat(count("district_travel")).isEqualTo(districts);
        assertThat(count("service_allowance")).isEqualTo(allowances);
    }

    private int count(String table) {
        return db.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }
}
