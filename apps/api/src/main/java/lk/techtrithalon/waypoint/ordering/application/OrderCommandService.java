package lk.techtrithalon.waypoint.ordering.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.reference.domain.CalendarDay;
import lk.techtrithalon.waypoint.reference.domain.Outlet;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderCommandService {
    private final OrderRepository orders;
    private final ReferenceService reference;
    private final DeliveryDateService deliveryDates;
    private final AuditService audit;
    private final Clock clock;

    public OrderCommandService(
        OrderRepository orders,
        ReferenceService reference,
        DeliveryDateService deliveryDates,
        AuditService audit,
        Clock clock
    ) {
        this.orders = orders;
        this.reference = reference;
        this.deliveryDates = deliveryDates;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    @PreAuthorize("hasRole('STORE_MANAGER')")
    public CustomerOrder placeConfirmed(
        CurrentUser user, String tempRequirement, int units, BigDecimal weightKg, BigDecimal volumeM3, LocalDate expectedDeliveryDate
    ) {
        if (user.outletId() == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
        }
        String temp = normalizeTemp(tempRequirement);
        Outlet outlet = reference.outlet(user, user.outletId());
        if ("chilled".equals(temp) && !"Fresh".equals(outlet.brand())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CHILLED_FRESH_ONLY",
                "Only Fresh outlets may place chilled orders");
        }
        if (units < 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_UNITS", "Units must be at least 1");
        }
        BigDecimal weight = requirePositive(weightKg, "weightKg", "INVALID_WEIGHT");
        BigDecimal volume = requirePositive(volumeM3, "volumeM3", "INVALID_VOLUME").setScale(3, RoundingMode.HALF_UP);
        weight = weight.setScale(2, RoundingMode.HALF_UP);

        LocalDate orderDate = deliveryDates.deliveryDateNow();
        if (expectedDeliveryDate != null && !expectedDeliveryDate.equals(orderDate)) {
            throw new ApiException(HttpStatus.CONFLICT, "DELIVERY_DATE_CHANGED",
                "The delivery date changed; review the updated date before confirming");
        }
        CalendarDay day = reference.calendar(orderDate, orderDate).stream().findFirst()
            .orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NO_OPERATING_DAY",
                "Delivery date is not in the calendar"));
        if (!day.operating()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NON_OPERATING_DAY",
                "Delivery date is not an operating day");
        }
        if (orders.existsActive(outlet.outletId(), orderDate, temp)) {
            throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_TEMP_ORDER",
                "An active " + temp + " order already exists for this outlet on " + orderDate);
        }

        Instant now = clock.instant();
        CustomerOrder created = orders.insertConfirmed(
            outlet.outletId(), outlet.brand(), outlet.depot(), outlet.district(), orderDate, now,
            temp, units, weight, volume, day.isoYear(), day.isoWeek(), user.id()
        );
        audit.record("order.confirmed", user, "order", String.valueOf(created.id()), null, created, null);
        return created;
    }

    private static String normalizeTemp(String tempRequirement) {
        if (tempRequirement == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TEMP", "Use ambient or chilled");
        }
        String temp = tempRequirement.trim().toLowerCase();
        if (!"ambient".equals(temp) && !"chilled".equals(temp)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TEMP", "Use ambient or chilled");
        }
        return temp;
    }

    private static BigDecimal requirePositive(BigDecimal value, String field, String code) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, code, field + " must be greater than zero");
        }
        return value;
    }
}
