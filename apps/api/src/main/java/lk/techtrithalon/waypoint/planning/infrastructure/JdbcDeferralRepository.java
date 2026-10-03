package lk.techtrithalon.waypoint.planning.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.application.DeferralRepository;
import lk.techtrithalon.waypoint.planning.domain.DeferralRecord;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
class JdbcDeferralRepository implements DeferralRepository {
    private static final String SELECT = """
        SELECT d.*, a.acknowledged_at FROM deferral d
        LEFT JOIN deferral_acknowledgement a ON a.deferral_id = d.id
        """;
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    private final RowMapper<DeferralRecord> row;

    JdbcDeferralRepository(JdbcTemplate db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
        this.row = (rs, i) -> new DeferralRecord(
            rs.getLong("id"), rs.getLong("order_id"), rs.getString("order_ref"), rs.getString("outlet_id"),
            rs.getString("brand"), rs.getString("temp_requirement"), rs.getLong("plan_id"),
            rs.getDate("plan_date").toLocalDate(), rs.getDate("next_planning_date").toLocalDate(), rs.getString("depot"),
            rs.getString("reason_code"), rs.getString("rule_code"), rs.getString("reason"),
            rs.getBoolean("protect_next_run"), rs.getBoolean("notify_store"), rs.getInt("consecutive_deferrals"),
            readEvidence(rs.getString("evidence_json")), rs.getString("decided_by_name"),
            rs.getTimestamp("decided_at").toInstant(), rs.getTimestamp("recorded_at").toInstant(),
            rs.getTimestamp("acknowledged_at") == null ? null : rs.getTimestamp("acknowledged_at").toInstant(), null);
    }

    @Override
    public List<OutletDeferral> historyForOutlets(Collection<String> outletIds, LocalDate from, LocalDate beforeExclusive) {
        if (outletIds.isEmpty()) return List.of();
        List<Object> args = new ArrayList<>(outletIds);
        args.add(Date.valueOf(from));
        args.add(Date.valueOf(beforeExclusive));
        return db.query("SELECT order_id,outlet_id,plan_date,next_planning_date,reason_code,protect_next_run FROM deferral WHERE outlet_id IN ("
                + String.join(",", Collections.nCopies(outletIds.size(), "?")) + ") AND plan_date>=? AND plan_date<? ORDER BY plan_date DESC,id DESC",
            (rs, i) -> outletRow(rs), args.toArray());
    }

    @Override
    public List<OutletDeferral> carriedInto(Collection<Long> orderIds, LocalDate planningDate) {
        if (orderIds.isEmpty()) return List.of();
        List<Object> args = new ArrayList<>(orderIds);
        args.add(Date.valueOf(planningDate));
        return db.query("SELECT order_id,outlet_id,plan_date,next_planning_date,reason_code,protect_next_run FROM deferral WHERE order_id IN ("
                + String.join(",", Collections.nCopies(orderIds.size(), "?")) + ") AND next_planning_date=? ORDER BY plan_date DESC,id DESC",
            (rs, i) -> outletRow(rs), args.toArray());
    }

    @Override
    public long insert(NewDeferral d) {
        return db.queryForObject("""
            INSERT INTO deferral(order_id,order_ref,brand,temp_requirement,outlet_id,plan_id,plan_date,next_planning_date,depot,
              reason_code,rule_code,reason,protect_next_run,notify_store,consecutive_deferrals,evidence_json,
              decided_by,decided_by_name,decided_at,recorded_by,recorded_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?,?,?) RETURNING id
            """, Long.class, d.orderId(), d.orderRef(), d.brand(), d.tempRequirement(), d.outletId(), d.planId(),
            Date.valueOf(d.planDate()), Date.valueOf(d.nextPlanningDate()), d.depot(), d.reasonCode(), d.ruleCode(),
            d.reason(), d.protectNextRun(), d.notifyStore(), d.consecutiveDeferrals(), writeEvidence(d.evidence()),
            d.decidedBy(), d.decidedByName(), Timestamp.from(d.decidedAt()), d.recordedBy(), Timestamp.from(d.recordedAt()));
    }

    @Override
    public List<DeferralRecord> forRun(LocalDate planDate, String depot) {
        return db.query(SELECT + " WHERE d.plan_date=? AND d.depot=? ORDER BY d.order_ref", row, Date.valueOf(planDate), depot);
    }

    @Override
    public List<DeferralRecord> forOutlet(String outletId, boolean notifiedOnly) {
        return db.query(SELECT + " WHERE d.outlet_id=?" + (notifiedOnly ? " AND d.notify_store" : "")
            + " ORDER BY d.plan_date DESC,d.id DESC", row, outletId);
    }

    @Override
    public Optional<DeferralRecord> find(long id) {
        return db.query(SELECT + " WHERE d.id=?", row, id).stream().findFirst();
    }

    @Override
    public boolean acknowledge(long id, long actor, Instant at) {
        return db.update("INSERT INTO deferral_acknowledgement(deferral_id,acknowledged_by,acknowledged_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
            id, actor, Timestamp.from(at)) == 1;
    }

    private static OutletDeferral outletRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new OutletDeferral(rs.getLong("order_id"), rs.getString("outlet_id"), rs.getDate("plan_date").toLocalDate(),
            rs.getDate("next_planning_date").toLocalDate(), rs.getString("reason_code"), rs.getBoolean("protect_next_run"));
    }

    private Map<String, Object> readEvidence(String json) {
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Unreadable deferral evidence", e);
        }
    }

    private String writeEvidence(Map<String, Object> evidence) {
        try {
            return mapper.writeValueAsString(evidence);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Deferral evidence cannot be serialised", e);
        }
    }
}
