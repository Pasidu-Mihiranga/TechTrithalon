package lk.techtrithalon.waypoint.ordering.application;

import java.time.LocalDate;
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

    long countByDateDepotStatus(LocalDate date, String depot, String status);
}
