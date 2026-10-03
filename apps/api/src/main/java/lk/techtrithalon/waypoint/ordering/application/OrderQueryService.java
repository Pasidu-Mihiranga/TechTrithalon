package lk.techtrithalon.waypoint.ordering.application;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.List;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;
import lk.techtrithalon.waypoint.ordering.domain.CutoffInfo;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.DashboardSnapshot;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;
import lk.techtrithalon.waypoint.ordering.domain.PlanningQueueSummary;
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
    public DashboardSnapshot dashboard(CurrentUser user, LocalDate date, String requestedDepot) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        reference.day(day);
        String depot = requestedDepot == null || requestedDepot.isBlank() ? user.depot() : requestedDepot;
        if (depot != null && (!user.canAccessDepot(depot) || !reference.depots(user).contains(depot))) throw missing();
        // Orders to plan include those carried into this run by an earlier deferral.
        long confirmed = orders.countByDateDepotStatus(day, depot, "confirmed")
            + orders.countByDateDepotStatus(day, depot, "deferred");
        long planned = orders.countByDateDepotStatus(day, depot, "planned");
        int total = (int) (confirmed + planned);
        String depotLabel = depot == null ? "All depots" : depot;
        return new DashboardSnapshot(
            day,
            depotLabel,
            DashboardSnapshot.Metric.of((int) confirmed),
            DashboardSnapshot.Metric.of((int) planned),
            DashboardSnapshot.Metric.later("Phase 11"),
            DashboardSnapshot.Metric.later("Phase 16"),
            DashboardSnapshot.Metric.later("Phase 10"),
            List.of(),
            List.of(),
            DashboardSnapshot.PlanningProgress.of((int) planned, total)
        );
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public OrderPage dispatcherOrders(
        CurrentUser user, LocalDate date, String depot, String brand, String tempRequirement, String status,
        String query, String sort, boolean ascending, int page, int size
    ) {
        return dispatcherOrders(user, date, depot, brand, tempRequirement, status, query, sort, ascending, page, size, null);
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public OrderPage dispatcherOrders(
        CurrentUser user, LocalDate date, String depot, String brand, String tempRequirement, String status,
        String query, String sort, boolean ascending, int page, int size, String parkingConstraint
    ) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        reference.day(day);
        if (depot != null && !user.canAccessDepot(depot)) throw missing();
        String selectedDepot = depot == null || depot.isBlank() ? user.depot() : depot;
        if (parkingConstraint != null && !parkingConstraint.isBlank() && !"van_only".equals(parkingConstraint)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FILTER", "Unsupported parking filter");
        }
        List<String> permittedOutlets = "van_only".equals(parkingConstraint)
            ? reference.outlets(user, null, null).stream()
                .filter(outlet -> "van_only".equals(outlet.parkingConstraint()))
                .map(outlet -> outlet.outletId()).toList()
            : null;
        return orders.search(
            day, selectedDepot, null, brand, tempRequirement, status, query, sort, ascending, page, size, permittedOutlets
        );
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public PlanningQueueSummary planningQueueSummary(CurrentUser user, LocalDate date, String depot) {
        LocalDate day = date == null ? referenceProperties.demoOperatingDate() : date;
        reference.day(day);
        String selectedDepot = depot == null || depot.isBlank() ? user.depot() : depot;
        if (selectedDepot != null && (!user.canAccessDepot(selectedDepot) || !reference.depots(user).contains(selectedDepot))) {
            throw missing();
        }
        List<String> depots = selectedDepot == null ? reference.depots(user) : List.of(selectedDepot);
        List<CustomerOrder> queue = depots.stream()
            .flatMap(name -> orders.findConfirmedForDateDepot(day, name).stream()).toList();
        Set<String> vanOutlets = reference.outlets(user, null, null).stream()
            .filter(outlet -> "van_only".equals(outlet.parkingConstraint()))
            .map(outlet -> outlet.outletId()).collect(Collectors.toSet());
        int ambient = 0;
        int chilled = 0;
        int van = 0;
        BigDecimal volume = BigDecimal.ZERO;
        for (CustomerOrder order : queue) {
            if ("ambient".equals(order.tempRequirement())) ambient++;
            if ("chilled".equals(order.tempRequirement())) chilled++;
            if (vanOutlets.contains(order.outletId())) van++;
            volume = volume.add(order.volumeM3());
        }
        return new PlanningQueueSummary(queue.size(), ambient, chilled, van, volume);
    }

    @PreAuthorize("hasRole('DISPATCHER')")
    public CustomerOrder dispatcherOrder(CurrentUser user, long id) {
        CustomerOrder order = orders.findById(id).orElseThrow(OrderQueryService::missing);
        if (!user.canAccessDepot(order.depot())) throw missing();
        return order;
    }

    /**
     * Published for planning: confirmed orders eligible for a date+depot snapshot.
     * Callers must already have enforced dispatcher role and depot access.
     */
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<CustomerOrder> confirmedForPlanning(CurrentUser user, LocalDate date, String depot) {
        if (!user.canAccessDepot(depot)) throw missing();
        reference.day(date);
        return orders.findConfirmedForDateDepot(date, depot);
    }

    /**
     * Published for planning: every order a planning run must account for. Before the first
     * publication this equals the confirmed set; afterwards it also holds the orders the current
     * published version planned, so a revision re-plans the whole run.
     */
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<CustomerOrder> ordersInPlanningRun(CurrentUser user, LocalDate date, String depot) {
        if (!user.canAccessDepot(depot)) throw missing();
        reference.day(date);
        return orders.findInPlanningRun(date, depot);
    }

    /** Published for planning: load specific orders by id (membership checks stay in planning). */
    @PreAuthorize("hasRole('DISPATCHER')")
    public List<CustomerOrder> ordersByIds(CurrentUser user, List<Long> ids) {
        return orders.findByIds(ids).stream()
            .filter(o -> user.canAccessDepot(o.depot()))
            .toList();
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
