package lk.techtrithalon.waypoint.planning.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import org.springframework.transaction.annotation.Isolation;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.fleetops.domain.FleetVehicle;
import lk.techtrithalon.waypoint.fleetops.domain.FuelBalance;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanningSnapshot;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class PlanningSnapshotService {
    private final PlanningSnapshotRepository snapshots;
    private final OrderQueryService orders;
    private final FleetService fleet;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final Clock clock;
    private final ObjectMapper canonical;
    private final AuditService audit;

    public PlanningSnapshotService(
        PlanningSnapshotRepository snapshots,
        OrderQueryService orders,
        FleetService fleet,
        ReferenceService reference,
        ReferenceProperties referenceProperties,
        Clock clock,
        ObjectMapper mapper,
        AuditService audit
    ) {
        this.snapshots = snapshots;
        this.orders = orders;
        this.fleet = fleet;
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.clock = clock;
        this.audit = audit;
        this.canonical = mapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public PlanningSnapshot create(CurrentUser user, LocalDate planDate, String depot, List<Long> orderIds) {
        LocalDate day = planDate == null ? referenceProperties.demoOperatingDate() : planDate;
        String resolvedDepot = resolveDepot(user, depot);
        CalendarDay calendarDay = reference.day(day);
        if (!calendarDay.operating()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "OPERATING_DAY",
                "Planning snapshots require an operating day");
        }

        Instant cutoff = day.minusDays(1).atTime(LocalTime.of(16, 0))
            .atZone(ZoneId.of("Asia/Colombo")).toInstant();
        if (clock.instant().isBefore(cutoff)) {
            throw new ApiException(HttpStatus.CONFLICT, "ORDERS_NOT_CLOSED",
                "Orders are not closed until 16:00 Asia/Colombo on the day before delivery");
        }
        List<CustomerOrder> selected = selectOrders(user, day, resolvedDepot, orderIds);
        String mode = orderIds == null || orderIds.isEmpty() ? "all" : "selected";
        Map<String, Object> inputs = freezeInputs(user, day, resolvedDepot, selected);
        List<Long> sortedIds = selected.stream().map(CustomerOrder::id).sorted().toList();
        String referenceVersion = hash(writeJson(inputs.get("reference")));
        PlanningSnapshot snapshot = snapshots.insert(
            day, resolvedDepot, clock.instant(), sortedIds,
            writeJson(inputs.get("fleet")), writeJson(inputs.get("constraints")),
            referenceVersion, hash(writeJson(inputs)), user.id(), writeJson(inputs), mode
        );
        audit.record("planning.snapshot.created", user, "planning_snapshot",
            String.valueOf(snapshot.id()), null, Map.of("contentHash", snapshot.contentHash(),
                "orderIds", sortedIds, "selectionMode", mode), null);
        return snapshot;
    }

    public PlanningSnapshot get(CurrentUser user, long id) {
        PlanningSnapshot snapshot = snapshots.findById(id)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"));
        if (!user.canAccessDepot(snapshot.depot())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        return snapshot;
    }

    public PlanningSnapshot latest(CurrentUser user, LocalDate planDate, String depot) {
        LocalDate day = planDate == null ? referenceProperties.demoOperatingDate() : planDate;
        String resolvedDepot = resolveDepot(user, depot);
        reference.day(day);
        return snapshots.findLatest(day, resolvedDepot)
            .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"));
    }

    /** Compare the same selection policy against a consistent current input set. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> compare(CurrentUser user, long id) {
        PlanningSnapshot snapshot = get(user, id);
        List<CustomerOrder> eligible = orders.confirmedForPlanning(user, snapshot.planDate(), snapshot.depot());
        List<CustomerOrder> current = "selected".equals(snapshot.selectionMode())
            ? eligible.stream().filter(o -> snapshot.orderIds().contains(o.id())).toList() : eligible;
        String currentHash = hash(writeJson(freezeInputs(user, snapshot.planDate(), snapshot.depot(), current)));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("snapshotId", snapshot.id());
        result.put("snapshotHash", snapshot.contentHash());
        result.put("currentHash", currentHash);
        result.put("unchanged", snapshot.inputs() != null && currentHash.equals(snapshot.contentHash()));
        result.put("requiresRegeneration", snapshot.inputs() == null);
        result.put("snapshotOrderCount", snapshot.orderIds().size());
        result.put("currentOrderCount", current.size());
        result.put("newEligibleOrderIds", eligible.stream().map(CustomerOrder::id)
            .filter(orderId -> !snapshot.orderIds().contains(orderId)).toList());
        return result;
    }

    private Map<String, Object> freezeInputs(CurrentUser user, LocalDate day, String depot,
                                             List<CustomerOrder> selected) {
        Map<String, Object> referenceInputs = new TreeMap<>();
        referenceInputs.put("outlets", reference.outlets(user, null, null).stream()
            .filter(o -> depot.equals(o.depot())).sorted(java.util.Comparator.comparing(
                lk.techtrithalon.waypoint.reference.domain.Outlet::outletId)).toList());
        referenceInputs.put("districtTravel", reference.districts(user).stream()
            .filter(d -> depot.equals(d.depot())).sorted(java.util.Comparator.comparing(
                lk.techtrithalon.waypoint.reference.domain.DistrictTravel::district)).toList());
        referenceInputs.put("serviceAllowances", reference.allowances(user).stream()
            .sorted(java.util.Comparator.comparing(lk.techtrithalon.waypoint.reference.domain.ServiceAllowance::brand)
                .thenComparing(lk.techtrithalon.waypoint.reference.domain.ServiceAllowance::dockType)).toList());
        referenceInputs.put("calendar", reference.day(day));
        Map<String, Object> inputs = new TreeMap<>();
        inputs.put("schemaVersion", 1);
        inputs.put("planDate", day);
        inputs.put("depot", depot);
        inputs.put("orders", selected.stream().sorted(java.util.Comparator.comparingLong(CustomerOrder::id)).toList());
        inputs.put("fleet", freezeFleet(user, day, depot));
        inputs.put("constraints", freezeConstraints(reference.day(day)));
        inputs.put("reference", referenceInputs);
        return inputs;
    }

    private List<CustomerOrder> selectOrders(
        CurrentUser user, LocalDate day, String depot, List<Long> orderIds
    ) {
        if (orderIds == null || orderIds.isEmpty()) {
            return orders.confirmedForPlanning(user, day, depot);
        }
        List<Long> distinct = orderIds.stream().filter(Objects::nonNull).distinct().toList();
        List<CustomerOrder> found = orders.ordersByIds(user, distinct);
        if (found.size() != distinct.size()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                "One or more selected orders were not found for this depot");
        }
        for (CustomerOrder order : found) {
            if (!"confirmed".equals(order.status()) && !"deferred".equals(order.status())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                    "Only confirmed or carried-forward orders may enter a planning snapshot");
            }
            if (!day.equals(order.planningDate()) || !depot.equals(order.depot())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SELECTION_INVALID",
                    "Selected orders must match the plan date and depot");
            }
        }
        return found.stream().sorted((a, b) -> Long.compare(a.id(), b.id())).toList();
    }

    private List<Map<String, Object>> freezeFleet(CurrentUser user, LocalDate day, String depot) {
        List<FleetVehicle> vehicles = fleet.fleet(user, day).stream()
            .filter(v -> depot.equals(v.depot()))
            .sorted((a, b) -> a.vehicleId().compareTo(b.vehicleId()))
            .toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (FleetVehicle v : vehicles) {
            FuelBalance fuel = fleet.fuel(user, v.vehicleId(), day);
            Map<String, Object> row = new TreeMap<>();
            row.put("vehicleId", v.vehicleId());
            row.put("type", v.type());
            row.put("temp", v.temp());
            row.put("weightCapKg", v.weightCapKg());
            row.put("volumeCapM3", v.volumeCapM3());
            row.put("depot", v.depot());
            row.put("kmPerL", v.kmPerL());
            row.put("fuelType", v.fuelType());
            row.put("availabilityStatus", v.availabilityStatus());
            row.put("availabilityRecorded", v.availabilityRecorded());
            row.put("weeklyFuelQuotaL", fuel.quotaLitres());
            row.put("fuelRemainingL", fuel.remainingLitres());
            row.put("fuelRecorded", fuel.recorded());
            rows.add(row);
        }
        return rows;
    }

    private Map<String, Object> freezeConstraints(CalendarDay day) {
        Map<String, Object> constraints = new TreeMap<>();
        constraints.put("operating", day.operating());
        constraints.put("isoYear", day.isoYear());
        constraints.put("isoWeek", day.isoWeek());
        constraints.put("cutoffLocalTime", "16:00:00");
        constraints.put("timeZone", "Asia/Colombo");
        constraints.put("ruleVersion", "booklet-v1");
        constraints.put("freshBudgetStart", "03:30:00");
        constraints.put("freshBudgetEnd", "08:00:00");
        constraints.put("otherBudgetStart", "08:00:00");
        constraints.put("otherBudgetEnd", "16:00:00");
        constraints.put("maxTripsPerVehicleDay", 2);
        return constraints;
    }

    private String resolveDepot(CurrentUser user, String depot) {
        if (user.depot() != null && !user.depot().isBlank()) {
            if (depot != null && !depot.isBlank() && !user.depot().equals(depot)) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
            }
            return user.depot();
        }
        if (depot == null || depot.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DEPOT_REQUIRED",
                "Provide a depot when the dispatcher is not scoped to one");
        }
        if (!user.canAccessDepot(depot)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        if (!reference.depots(user).contains(depot)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        return depot;
    }

    private String writeJson(Object value) {
        try {
            return canonical.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialise snapshot payload", e);
        }
    }

    private String hash(String payload) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to hash snapshot", e);
        }
    }
}
