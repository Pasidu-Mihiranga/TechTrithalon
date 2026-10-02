package lk.techtrithalon.waypoint.planning.infrastructure;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Array;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.application.PlanningSnapshotRepository;
import lk.techtrithalon.waypoint.planning.domain.PlanningSnapshot;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPlanningSnapshotRepository implements PlanningSnapshotRepository {
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    private final RowMapper<PlanningSnapshot> row;

    JdbcPlanningSnapshotRepository(JdbcTemplate db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
        this.row = (rs, i) -> {
            try {
                Array arr = rs.getArray("order_ids");
                Long[] ids = arr == null ? new Long[0] : (Long[]) arr.getArray();
                List<Map<String, Object>> fleet = mapper.readValue(
                    rs.getString("fleet_json"), new TypeReference<>() {});
                Map<String, Object> constraints = mapper.readValue(
                    rs.getString("constraints_json"), new TypeReference<>() {});
                return new PlanningSnapshot(
                    rs.getLong("id"),
                    rs.getDate("plan_date").toLocalDate(),
                    rs.getString("depot"),
                    rs.getTimestamp("taken_at").toInstant(),
                    Arrays.asList(ids),
                    fleet,
                    constraints,
                    rs.getString("reference_version"),
                    rs.getString("content_hash"),
                    rs.getObject("taken_by") == null ? null : rs.getLong("taken_by"),
                    rs.getString("inputs_json") == null ? null : mapper.readValue(
                        rs.getString("inputs_json"), new TypeReference<Map<String, Object>>() {}),
                    rs.getString("selection_mode"),
                    ids.length
                );
            } catch (Exception e) {
                throw new IllegalStateException("Failed to map planning_snapshot row", e);
            }
        };
    }

    @Override
    public PlanningSnapshot insert(
        LocalDate planDate, String depot, Instant takenAt, List<Long> orderIds,
        String fleetJson, String constraintsJson, String referenceVersion, String contentHash, long takenBy,
        String inputsJson, String selectionMode
    ) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        db.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                INSERT INTO planning_snapshot (
                  plan_date, depot, taken_at, order_ids, fleet_json, constraints_json,
                  reference_version, content_hash, taken_by, inputs_json, selection_mode
                ) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?::jsonb, ?)
                """, new String[] {"id"});
            ps.setDate(1, Date.valueOf(planDate));
            ps.setString(2, depot);
            ps.setTimestamp(3, Timestamp.from(takenAt));
            ps.setArray(4, con.createArrayOf("bigint", orderIds.toArray(Long[]::new)));
            ps.setString(5, fleetJson);
            ps.setString(6, constraintsJson);
            ps.setString(7, referenceVersion);
            ps.setString(8, contentHash);
            ps.setLong(9, takenBy);
            ps.setString(10, inputsJson);
            ps.setString(11, selectionMode);
            return ps;
        }, keys);
        Number id = keys.getKey();
        if (id == null) throw new IllegalStateException("planning_snapshot insert returned no id");
        return findById(id.longValue()).orElseThrow();
    }

    @Override
    public Optional<PlanningSnapshot> findById(long id) {
        return db.query("SELECT * FROM planning_snapshot WHERE id=?", row, id).stream().findFirst();
    }

    @Override
    public Optional<PlanningSnapshot> findLatest(LocalDate planDate, String depot) {
        return db.query("""
            SELECT * FROM planning_snapshot
            WHERE plan_date=? AND depot=?
            ORDER BY taken_at DESC, id DESC
            LIMIT 1
            """, row, Date.valueOf(planDate), depot).stream().findFirst();
    }
}
