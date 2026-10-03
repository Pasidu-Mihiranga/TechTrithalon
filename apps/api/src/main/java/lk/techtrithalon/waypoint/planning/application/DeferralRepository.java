package lk.techtrithalon.waypoint.planning.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lk.techtrithalon.waypoint.planning.domain.DeferralRecord;

public interface DeferralRepository {
    /** Minimal history row used for fairness: outlet, run date, and the order it moved. */
    record OutletDeferral(long orderId, String outletId, LocalDate planDate, LocalDate nextPlanningDate,
                          String reasonCode, boolean protectNextRun) {}

    record NewDeferral(long orderId, String orderRef, String brand, String tempRequirement, String outletId, long planId, LocalDate planDate, LocalDate nextPlanningDate,
                       String depot, String reasonCode, String ruleCode, String reason, boolean protectNextRun,
                       boolean notifyStore, int consecutiveDeferrals, Map<String, Object> evidence,
                       long decidedBy, String decidedByName, Instant decidedAt, long recordedBy, Instant recordedAt) {}

    List<OutletDeferral> historyForOutlets(Collection<String> outletIds, LocalDate from, LocalDate beforeExclusive);
    List<OutletDeferral> carriedInto(Collection<Long> orderIds, LocalDate planningDate);
    long insert(NewDeferral deferral);
    List<DeferralRecord> forRun(LocalDate planDate, String depot);
    List<DeferralRecord> forOutlet(String outletId, boolean notifiedOnly);
    Optional<DeferralRecord> find(long id);
    boolean acknowledge(long id, long actor, Instant at);
}
