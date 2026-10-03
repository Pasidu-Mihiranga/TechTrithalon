package lk.techtrithalon.waypoint.ordering.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.ordering.domain.OrderPage;


public interface OrderRepository {
    boolean markPlanned(long id, int expectedVersion, java.time.Instant at);
    /** Moves an order between road statuses; false when it is no longer in {@code from} or its version changed. */
    boolean markRoadStatus(long id, int expectedVersion, Collection<String> from, String to, java.time.Instant at);
    /** Moves a confirmed or carried order to a later planning run; false when it changed meanwhile. */
    boolean markDeferred(long id, int expectedVersion, LocalDate nextPlanningDate, java.time.Instant at);
    default OrderPage search(
        LocalDate date,
        String depot,
        String outletId,
        String brand,
        String tempRequirement,
        String status,
        String query,
        String sort,
        boolean ascending,
        int page,
        int size
    ) {
        return search(date, depot, outletId, brand, tempRequirement, status, query, sort, ascending, page, size, null);
    }

    OrderPage search(
        LocalDate date, String depot, String outletId, String brand, String tempRequirement,
        String status, String query, String sort, boolean ascending, int page, int size,
        Collection<String> permittedOutletIds
    );

    Optional<CustomerOrder> findById(long id);

    Optional<CustomerOrder> findByRef(String ref);

    List<CustomerOrder> findByIds(Collection<Long> ids);

    /** Orders eligible for the planning run on {@code date}: confirmed, or carried forward by a deferral. */
    List<CustomerOrder> findConfirmedForDateDepot(LocalDate date, String depot);
    /** Every order still in a run: confirmed, carried forward, planned by its current published version, or already on the road. */
    List<CustomerOrder> findInPlanningRun(LocalDate date, String depot);

    long countByDateDepotStatus(LocalDate date, String depot, String status);

    boolean existsActive(String outletId, LocalDate orderDate, String tempRequirement);

    CustomerOrder insertConfirmed(
        String outletId,
        String brand,
        String depot,
        String district,
        LocalDate orderDate,
        Instant placedAt,
        String tempRequirement,
        int units,
        BigDecimal weightKg,
        BigDecimal volumeM3,
        int isoYear,
        int isoWeek,
        long placedBy
    );
}
