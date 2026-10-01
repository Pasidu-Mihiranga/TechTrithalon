package lk.techtrithalon.waypoint.reference;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Date;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Imports the five operational reference CSVs. Idempotent — keyed on the CSVs' natural ids — and
 * atomic: a failed import or a failed invariant check rolls the whole import back.
 */
@Component
@ConditionalOnProperty(name = "app.reference.seed-on-startup", havingValue = "true", matchIfMissing = true)
public class ReferenceDataSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ReferenceDataSeeder.class);

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ReferenceProperties properties;

    public ReferenceDataSeeder(JdbcTemplate db, TransactionTemplate tx, ReferenceProperties properties) {
        this.db = db;
        this.tx = tx;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed();
    }

    public void seed() {
        Path dir = Path.of(properties.dataDir());
        if (!Files.isDirectory(dir)) {
            throw new IllegalStateException("Reference CSV directory is missing: " + dir.toAbsolutePath()
                + " — place the supplied dataset under dataset/data/ (see README)");
        }
        tx.executeWithoutResult(status -> {
            importAll(dir);
            verifyInvariants();
        });
        log.info("Reference data ready; demo operating date {}", properties.demoOperatingDate());
    }

    private void importAll(Path dir) {
        // district_travel first: outlet.district references it.
        rows(dir, "district_travel.csv", row -> db.update("""
            INSERT INTO district_travel (district, depot, road_class, free_flow_kmh,
              depot_to_district_km, depot_to_district_min, inter_stop_km, inter_stop_min)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (district) DO NOTHING
            """, row.get("district"), row.get("depot"), row.get("road_class"),
            dec(row, "free_flow_kmh"), dec(row, "depot_to_district_km"),
            integer(row, "depot_to_district_freeflow_min"), dec(row, "inter_stop_km"),
            integer(row, "inter_stop_freeflow_min")));
        rows(dir, "outlets.csv", this::insertOutlet);
        rows(dir, "vehicles.csv", row -> db.update("""
            INSERT INTO vehicle (vehicle_id, type, temp, weight_cap_kg, volume_cap_m3,
              fuel_type, km_per_l, weekly_fuel_quota_l, depot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (vehicle_id) DO NOTHING
            """, row.get("vehicle_id"), row.get("type"), row.get("temp"),
            dec(row, "weight_cap_kg"), dec(row, "volume_cap_m3"), row.get("fuel_type"),
            dec(row, "km_per_l"), dec(row, "weekly_fuel_quota_l"), row.get("depot")));
        rows(dir, "calendar.csv", row -> db.update("""
            INSERT INTO calendar_day (date, dow, dow_name, is_weekend, iso_year, iso_week,
              is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (date) DO NOTHING
            """, Date.valueOf(LocalDate.parse(row.get("date"))), integer(row, "dow"),
            row.get("dow_name"), bool(row, "is_weekend"), integer(row, "iso_year"),
            integer(row, "iso_week"), bool(row, "is_payday"), nullable(row, "festival"),
            dec(row, "festival_ramp"), bool(row, "is_holiday"), bool(row, "monsoon"),
            bool(row, "is_operating")));
        rows(dir, "service_allowance.csv", row -> db.update("""
            INSERT INTO service_allowance (brand, dock_type, minutes)
            VALUES (?, ?, ?) ON CONFLICT (brand, dock_type) DO NOTHING
            """, row.get("brand"), row.get("dock_type"), integer(row, "service_allowance_min")));
    }

    private void insertOutlet(Map<String, String> row) {
        LocalTime open = LocalTime.parse(row.get("window_open_time"));
        LocalTime close = LocalTime.parse(row.get("window_close_time"));
        LocalTime mallOpen = null;
        LocalTime mallClose = null;
        String mall = row.get("mall_window");
        if (!mall.isEmpty()) {
            String[] parts = mall.split("-", -1);
            if (parts.length != 2) throw new IllegalArgumentException("Invalid mall window: " + mall);
            mallOpen = LocalTime.parse(parts[0]);
            mallClose = LocalTime.parse(parts[1]);
            // The effective window is the intersection of the outlet and mall windows.
            // An empty intersection means an unservable outlet: fail the import loudly.
            if (!max(open, mallOpen).isBefore(min(close, mallClose))) {
                throw new IllegalArgumentException("Empty effective delivery window for " + row.get("outlet_id"));
            }
        }
        db.update("""
            INSERT INTO outlet (outlet_id, brand, district, depot, dock_type,
              parking_constraint, mall_window_open, mall_window_close, window_open, window_close)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (outlet_id) DO NOTHING
            """, row.get("outlet_id"), row.get("brand"), row.get("district"), row.get("depot"),
            row.get("dock_type"), row.get("parking_constraint"),
            mallOpen == null ? null : Time.valueOf(mallOpen),
            mallClose == null ? null : Time.valueOf(mallClose),
            Time.valueOf(open), Time.valueOf(close));
    }

    private void verifyInvariants() {
        ReferenceProperties.ExpectedCounts expected = properties.expected();
        assertCount("outlet", expected.outlets());
        assertCount("vehicle", expected.vehicles());
        assertCount("calendar_day", expected.calendarDays());
        assertCount("district_travel", expected.districts());
        assertCount("service_allowance", expected.serviceAllowances());
        Boolean operating = db.query("SELECT is_operating FROM calendar_day WHERE date = ?",
            rs -> rs.next() ? rs.getBoolean(1) : null, Date.valueOf(properties.demoOperatingDate()));
        if (!Boolean.TRUE.equals(operating)) {
            throw new IllegalStateException("Demo operating date " + properties.demoOperatingDate()
                + " is not an operating day in calendar_day");
        }
    }

    private static void rows(Path dir, String filename, Consumer<Map<String, String>> consumer) {
        List<String> lines;
        try {
            lines = Files.readAllLines(dir.resolve(filename));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + filename, e);
        }
        if (lines.isEmpty()) throw new IllegalArgumentException("Empty CSV: " + filename);
        List<String> header = split(lines.getFirst(), filename);
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) continue;
            List<String> values = split(lines.get(i), filename);
            if (values.size() != header.size()) {
                throw new IllegalArgumentException(filename + " line " + (i + 1) + " has " + values.size()
                    + " fields, expected " + header.size());
            }
            Map<String, String> row = IntStream.range(0, header.size()).boxed()
                .collect(Collectors.toMap(header::get, values::get));
            consumer.accept(row);
        }
    }

    /** The supplied files contain no quoted fields; refuse rather than mis-parse if that ever changes. */
    private static List<String> split(String line, String filename) {
        if (line.contains("\"")) throw new IllegalArgumentException(filename + " contains quoted fields; use a CSV parser");
        return List.of(line.split(",", -1));
    }

    private void assertCount(String table, int expected) {
        Integer actual = db.queryForObject("SELECT count(*) FROM " + table, Integer.class);
        if (actual == null || actual != expected) {
            throw new IllegalStateException(table + " expected " + expected + " rows but had " + actual);
        }
    }

    private static LocalTime max(LocalTime a, LocalTime b) { return a.isAfter(b) ? a : b; }
    private static LocalTime min(LocalTime a, LocalTime b) { return a.isBefore(b) ? a : b; }
    private static BigDecimal dec(Map<String, String> row, String key) { return new BigDecimal(row.get(key)); }
    private static int integer(Map<String, String> row, String key) { return Integer.parseInt(row.get(key)); }
    private static boolean bool(Map<String, String> row, String key) { return "1".equals(row.get(key)); }
    private static String nullable(Map<String, String> row, String key) {
        String value = row.get(key);
        return value.isEmpty() ? null : value;
    }
}
