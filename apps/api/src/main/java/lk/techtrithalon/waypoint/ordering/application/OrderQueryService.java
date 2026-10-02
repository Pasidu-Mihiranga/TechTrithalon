package lk.techtrithalon.waypoint.ordering.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.ordering.domain.CutoffInfo;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.DashboardSnapshot;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import lk.techtrithalon.waypoint.reference.ReferenceProperties;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class OrderQueryService {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Colombo");
    private static final LocalTime CUTOFF = LocalTime.of(16, 0);

    private final OrderRepository orders;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final Clock clock;

    public OrderQueryService(
        OrderRepository orders,
        ReferenceService reference,
        ReferenceProperties referenceProperties,
        Clock clock
    ) {
        this.orders = orders;
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.clock = clock;
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public DashboardSnapshot dashboard(CurrentUser user, LocalDate date) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        reference.day(day);
        String depot = user.depot();
        long confirmed = orders.countByDateDepotStatus(day, depot, "confirmed");
        String depotLabel = depot == null ? "All depots" : depot;
        return new DashboardSnapshot(
            day,
            depotLabel,
            DashboardSnapshot.Metric.of((int) confirmed),
            DashboardSnapshot.Metric.later("Phase 7"),
            DashboardSnapshot.Metric.later("Phase 11"),
            DashboardSnapshot.Metric.later("Phase 16"),
            DashboardSnapshot.Metric.later("Phase 10"),
            List.of(),
            List.of(),
            DashboardSnapshot.PlanningProgress.later("Phase 7")
        );
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public OrderPage dispatcherOrders(
        CurrentUser user, LocalDate date, String brand, String tempRequirement, String status,
        String query, String sort, boolean ascending, int page, int size
    ) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        reference.day(day);
        return orders.search(
            day, user.depot(), null, brand, tempRequirement, status, query, sort, ascending, page, size
        );
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public CustomerOrder dispatcherOrder(CurrentUser user, long id) {
        CustomerOrder order = orders.findById(id).orElseThrow(OrderQueryService::missing);
        if (!user.canAccessDepot(order.depot())) throw missing();
        return order;
    }

    @PreAuthorize("hasRole('STORE_MANAGER')")
    public OrderPage storeOrders(
        CurrentUser user, LocalDate date, String status, String query, String sort,
        boolean ascending, int page, int size
    ) {
        if (user.outletId() == null) throw missing();
        return orders.search(
            date, null, user.outletId(), null, null, status, query, sort, ascending, page, size
        );
    }

    @PreAuthorize("hasRole('STORE_MANAGER')")
    public CustomerOrder storeOrder(CurrentUser user, long id) {
        CustomerOrder order = orders.findById(id).orElseThrow(OrderQueryService::missing);
        if (user.role() != Role.STORE_MANAGER || !user.canAccessOutlet(order.outletId())) throw missing();
        return order;
    }

    @PreAuthorize("hasRole('STORE_MANAGER')")
    public CutoffInfo cutoff(CurrentUser user) {
        if (user.outletId() == null) throw missing();
        Instant now = clock.instant();
        ZonedDateTime localNow = now.atZone(BUSINESS_ZONE);
        ZonedDateTime nextCutoff = localNow.toLocalDate().atTime(CUTOFF).atZone(BUSINESS_ZONE);
        if (!localNow.toLocalTime().isBefore(CUTOFF)) {
            nextCutoff = nextCutoff.plusDays(1);
        }
        // Delivery is for the next operating calendar day after the cutoff day. Until Phase 4
        // rolls over Sundays/holidays, expose the demo operating date when open, otherwise the day
        // after nextCutoff's calendar date when that is known in calendar_day.
        LocalDate candidate = nextCutoff.toLocalDate().plusDays(1);
        LocalDate deliveryDate = reference.calendar(candidate, candidate).stream()
            .filter(d -> d.operating())
            .map(d -> d.date())
            .findFirst()
            .orElse(referenceProperties.demoOperatingDate());
        long seconds = Math.max(0, nextCutoff.toInstant().getEpochSecond() - now.getEpochSecond());
        boolean open = localNow.toLocalTime().isBefore(CUTOFF);
        return new CutoffInfo(CUTOFF, BUSINESS_ZONE.getId(), now, nextCutoff.toInstant(), seconds, open, deliveryDate);
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
    }
}
