package lk.techtrithalon.waypoint.ordering.application;

import java.time.LocalDate;
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
    private final OrderRepository orders;
    private final ReferenceService reference;
    private final ReferenceProperties referenceProperties;
    private final DeliveryDateService deliveryDates;

    public OrderQueryService(
        OrderRepository orders,
        ReferenceService reference,
        ReferenceProperties referenceProperties,
        DeliveryDateService deliveryDates
    ) {
        this.orders = orders;
        this.reference = reference;
        this.referenceProperties = referenceProperties;
        this.deliveryDates = deliveryDates;
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
        return deliveryDates.cutoffInfo();
    }

    private static ApiException missing() {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
    }
}
