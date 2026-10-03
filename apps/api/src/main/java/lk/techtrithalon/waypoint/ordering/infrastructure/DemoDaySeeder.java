package lk.techtrithalon.waypoint.ordering.infrastructure;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lk.techtrithalon.waypoint.ordering.DemoProperties;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Seeds the demo delivery day from local peak-day CSVs. Idempotent, never ships with the repository.
 * Runs after reference import and identity seed so outlet/vehicle/user foreign keys exist.
 */
@Component
@Order(30)
@ConditionalOnProperty(name = "app.demo.seed-on-startup", havingValue = "true", matchIfMissing = true)
public class DemoDaySeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoDaySeeder.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Colombo");
    private static final String FLEET_NOTE = "Demo-day fleet status from local peak-day fixture";

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final DemoProperties demo;
    private final ReferenceProperties reference;
    private final Clock clock;

    public DemoDaySeeder(
        JdbcTemplate db, TransactionTemplate tx, DemoProperties demo, ReferenceProperties reference, Clock clock
    ) {
        this.db = db;
        this.tx = tx;
        this.demo = demo;
        this.reference = reference;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed();
    }

    public void seed() {
        Path dir = Path.of(demo.dataDir());
        if (!Files.isDirectory(dir)) {
            throw new IllegalStateException("Demo CSV directory is missing: " + dir.toAbsolutePath()
                + " — place task2b_peak_day_*.csv under dataset/data/Test Data (see README)");
        }
        tx.executeWithoutResult(status -> {
            Long actorId = db.query(
                "SELECT id FROM app_user WHERE role='DISPATCHER' ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getLong(1) : null
            );
            if (actorId == null) {
                throw new IllegalStateException("Demo fleet seed needs a dispatcher account; enable identity seeding");
            }
            LocalDate day = reference.demoOperatingDate();
            Map<String, Object> calendar = db.queryForMap(
                "SELECT iso_year, iso_week, is_operating FROM calendar_day WHERE date=?", Date.valueOf(day)
            );
            if (!Boolean.TRUE.equals(calendar.get("is_operating"))) {
                throw new IllegalStateException("Demo operating date " + day + " is not an operating day");
            }
            int isoYear = ((Number) calendar.get("iso_year")).intValue();
            int isoWeek = ((Number) calendar.get("iso_week")).intValue();
            Timestamp placedAt = Timestamp.from(
                LocalDateTime.of(day.minusDays(1), LocalTime.of(15, 0)).atZone(ZONE).toInstant()
            );
            rows(dir, "task2b_peak_day_scenarios.csv", row -> insertOrder(row, day, isoYear, isoWeek, placedAt));
            rows(dir, "task2b_peak_day_fleet.csv", row -> insertAvailability(row, day, actorId));
            assertCount(
                "SELECT count(*) FROM customer_order WHERE order_date=?",
                demo.expectedOrders(),
                day,
                "demo orders"
            );
            assertCount(
                "SELECT count(*) FROM vehicle_availability WHERE date=?",
                demo.expectedFleetRows(),
                day,
                "demo fleet availability"
            );
        });
        log.info("Demo day {} seeded ({} orders, {} fleet rows)",
            reference.demoOperatingDate(), demo.expectedOrders(), demo.expectedFleetRows());
    }

    private void insertOrder(Map<String, String> row, LocalDate day, int isoYear, int isoWeek, Timestamp placedAt) {
        String outletId = required(row, "outlet_id");
        Integer outlets = db.queryForObject("SELECT count(*) FROM outlet WHERE outlet_id=?", Integer.class, outletId);
        if (outlets == null || outlets == 0) {
            throw new IllegalStateException("Demo order references unknown outlet " + outletId);
        }
        db.update("""
            INSERT INTO customer_order (
              ref, outlet_id, brand, depot, district, order_date, placed_at, confirmed_at,
              temp_requirement, units, weight_kg, volume_m3, status, iso_year, iso_week,
              placed_by, version, updated_at, source_deferred_yesterday, source_days_since_served
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, NULL, 0, ?, ?, ?)
            ON CONFLICT (ref) DO UPDATE SET
              source_deferred_yesterday = EXCLUDED.source_deferred_yesterday,
              source_days_since_served = EXCLUDED.source_days_since_served
            WHERE customer_order.source_deferred_yesterday IS NULL
              AND customer_order.source_days_since_served IS NULL
            """,
            required(row, "order_ref"),
            outletId,
            required(row, "brand"),
            required(row, "depot"),
            required(row, "district"),
            Date.valueOf(day),
            placedAt,
            placedAt,
            required(row, "temp_requirement"),
            Integer.parseInt(required(row, "order_units")),
            new BigDecimal(required(row, "order_weight_kg")),
            new BigDecimal(required(row, "order_volume_m3")),
            isoYear,
            isoWeek,
            placedAt,
            optionalFlag(row, "deferred_yesterday"),
            optionalInt(row, "days_since_last_served")
        );
    }

    private static Boolean optionalFlag(Map<String, String> row, String column) {
        String value = row.get(column);
        if (value == null || value.isBlank()) return null;
        return switch (value.trim()) {
            case "1", "true" -> Boolean.TRUE;
            case "0", "false" -> Boolean.FALSE;
            default -> throw new IllegalArgumentException("Invalid " + column + ": " + value);
        };
    }

    private static Integer optionalInt(Map<String, String> row, String column) {
        String value = row.get(column);
        return value == null || value.isBlank() ? null : Integer.valueOf(value.trim());
    }

    private void insertAvailability(Map<String, String> row, LocalDate day, long actorId) {
        String vehicleId = required(row, "vehicle_id");
        String status = required(row, "status");
        if (!"available".equals(status) && !"in_workshop".equals(status)) {
            throw new IllegalStateException("Invalid demo fleet status for " + vehicleId + ": " + status);
        }
        Integer vehicles = db.queryForObject("SELECT count(*) FROM vehicle WHERE vehicle_id=?", Integer.class, vehicleId);
        if (vehicles == null || vehicles == 0) {
            throw new IllegalStateException("Demo fleet references unknown vehicle " + vehicleId);
        }
        db.update("""
            INSERT INTO vehicle_availability (vehicle_id, date, status, note, version, updated_by, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT (vehicle_id, date) DO NOTHING
            """,
            vehicleId, Date.valueOf(day), status, FLEET_NOTE, actorId, Timestamp.from(clock.instant())
        );
    }

    private void assertCount(String sql, int expected, LocalDate day, String label) {
        Integer actual = db.queryForObject(sql, Integer.class, Date.valueOf(day));
        if (actual == null || actual != expected) {
            throw new IllegalStateException(label + " expected " + expected + " rows but had " + actual);
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

    private static List<String> split(String line, String filename) {
        if (line.contains("\"")) throw new IllegalArgumentException(filename + " contains quoted fields; use a CSV parser");
        return List.of(line.split(",", -1));
    }

    private static String required(Map<String, String> row, String key) {
        String value = row.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + key);
        return value;
    }
}
