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
    OrderPage search(
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
    );

    Optional<CustomerOrder> findById(long id);

    Optional<CustomerOrder> findByRef(String ref);

    List<CustomerOrder> findByIds(Collection<Long> ids);

    List<CustomerOrder> findConfirmedForDateDepot(LocalDate date, String depot);

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
