package lk.techtrithalon.waypoint.planning.domain.rules;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.planning.domain.ConstraintRule;
import lk.techtrithalon.waypoint.planning.domain.ConstraintViolation;
import lk.techtrithalon.waypoint.planning.domain.EntityType;
import lk.techtrithalon.waypoint.planning.domain.PlanContext;
import lk.techtrithalon.waypoint.planning.domain.PlanOrder;
import lk.techtrithalon.waypoint.planning.domain.PlanStop;
import lk.techtrithalon.waypoint.planning.domain.PlanTrip;
import lk.techtrithalon.waypoint.planning.domain.Scope;
import lk.techtrithalon.waypoint.planning.domain.Severity;

/**
 * R1: All orders in a single trip must share the same brand and the same district.
 */
public class SameBrandDistrictRule implements ConstraintRule {

    public static final String CODE = "SAME_BRAND_DISTRICT";

    @Override
    public String code() {
        return CODE;
    }

    @Override
    public Severity severity() {
        return Severity.HARD;
    }

    @Override
    public Scope scope() {
        return Scope.TRIP;
    }

    @Override
    public List<ConstraintViolation> evaluate(PlanContext ctx) {
        if (ctx == null || ctx.trips() == null) {
            return List.of();
        }

        List<ConstraintViolation> violations = new ArrayList<>();

        for (PlanTrip trip : ctx.trips()) {
            String tripBrand = trip.brand();
            String tripDistrict = trip.district();

            for (PlanStop stop : trip.stops()) {
                PlanOrder order = stop.order();
                if (order == null) {
                    continue;
                }

                if (tripBrand != null && order.brand() != null && !tripBrand.equalsIgnoreCase(order.brand())) {
                    violations.add(new ConstraintViolation(
                        CODE,
                        Severity.HARD,
                        Scope.TRIP,
                        EntityType.TRIP,
                        String.valueOf(trip.id()),
                        "Trip " + trip.id() + " (brand " + tripBrand + ") cannot contain order "
                            + order.orderRef() + " of brand " + order.brand() + ".",
                        order.brand(),
                        tripBrand,
                        "SPLIT_BY_BRAND",
                        Map.of(
                            "tripId", trip.id(),
                            "orderRef", order.orderRef(),
                            "expectedBrand", tripBrand,
                            "actualBrand", order.brand()
                        )
                    ));
                }

                if (tripDistrict != null && order.district() != null && !tripDistrict.equalsIgnoreCase(order.district())) {
                    violations.add(new ConstraintViolation(
                        CODE,
                        Severity.HARD,
                        Scope.TRIP,
                        EntityType.TRIP,
                        String.valueOf(trip.id()),
                        "Trip " + trip.id() + " (district " + tripDistrict + ") cannot contain order "
                            + order.orderRef() + " in district " + order.district() + ".",
                        order.district(),
                        tripDistrict,
                        "SPLIT_BY_DISTRICT",
                        Map.of(
                            "tripId", trip.id(),
                            "orderRef", order.orderRef(),
                            "expectedDistrict", tripDistrict,
                            "actualDistrict", order.district()
                        )
                    ));
                }
            }
        }

        return violations;
    }
}
