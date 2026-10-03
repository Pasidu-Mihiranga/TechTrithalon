package lk.techtrithalon.waypoint.planning.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import lk.techtrithalon.waypoint.reference.domain.DistrictTravel;
import lk.techtrithalon.waypoint.reference.domain.ServiceAllowance;
import org.junit.jupiter.api.Test;

class StopSequencerTest {
    private static final DistrictTravel ALPHA = new DistrictTravel("Alpha", "Peliyagoda", "urban", BigDecimal.valueOf(30),
        BigDecimal.valueOf(10), 20, BigDecimal.valueOf(3), 7);
    private static final Map<String, Map<String, ServiceAllowance>> SERVICE =
        Map.of("Fresh", Map.of("street", new ServiceAllowance("Fresh", "street", 11)));

    private static PlanOrder order(long id, String close) {
        return new PlanOrder(id, "SYN-" + id, "OUT" + id, "Fresh", "ambient", BigDecimal.ONE, BigDecimal.TEN,
            "Alpha", "Peliyagoda", "street", "normal", LocalTime.of(5, 0), close == null ? null : LocalTime.parse(close));
    }

    private static Map<Long, PlanOrder> byId(PlanOrder... orders) {
        java.util.HashMap<Long, PlanOrder> map = new java.util.HashMap<>();
        for (PlanOrder o : orders) map.put(o.id(), o);
        return map;
    }

    @Test void sortsByEffectiveWindowCloseWhateverTheInputOrder() {
        var orders = byId(order(1, "07:30"), order(2, "05:20"), order(3, "06:00"));
        assertThat(StopSequencer.defaultSequence(List.of(1L, 2L, 3L), orders)).containsExactly(2L, 3L, 1L);
        assertThat(StopSequencer.defaultSequence(List.of(3L, 1L, 2L), orders)).containsExactly(2L, 3L, 1L);
    }

    @Test void breaksTiesByOrderIdAndPutsMissingWindowsAndUnknownIdsLast() {
        var orders = byId(order(9, "07:30"), order(4, "07:30"), order(5, null));
        assertThat(StopSequencer.defaultSequence(List.of(42L, 5L, 9L, 4L), orders)).containsExactly(4L, 9L, 5L, 42L);
    }

    @Test void insertionKeepsTheExistingSequenceAndFindsTheEddSlot() {
        var orders = byId(order(1, "07:30"), order(2, "05:20"), order(3, "06:00"), order(4, "06:30"));
        // The dispatcher put 1 before 3; inserting 2 and 4 must not undo that order.
        assertThat(StopSequencer.defaultInsertionIndex(List.of(1L, 3L), 2L, orders)).isZero();
        assertThat(StopSequencer.defaultInsertionIndex(List.of(3L, 1L), 4L, orders)).isEqualTo(1);
        assertThat(StopSequencer.defaultInsertionIndex(List.of(3L, 1L), 99L, orders)).isEqualTo(2);
    }

    @Test void orderChangesArrivalsButNotTripMinutesDistanceOrFuel() {
        var a = order(1, "07:30");
        var b = order(2, "05:20");
        var calc = new ArrivalCalculator();
        var edd = trip(1, List.of(b, a));
        var reversed = trip(1, List.of(a, b));
        var minutes = new TripTimeCalculator();
        var fuel = new DistanceFuelCalculator();
        var vehicle = new PlanVehicle("VEH1", "truck", "reefer", BigDecimal.valueOf(5000), BigDecimal.valueOf(25),
            "Peliyagoda", BigDecimal.valueOf(5), BigDecimal.valueOf(400), "available");
        assertThat(minutes.compute(edd, ALPHA, SERVICE)).isEqualTo(minutes.compute(reversed, ALPHA, SERVICE));
        assertThat(fuel.compute(edd, ALPHA, vehicle)).isEqualTo(fuel.compute(reversed, ALPHA, vehicle));
        var eddArrivals = calc.schedule(edd, ALPHA, SERVICE, LocalTime.of(3, 30));
        var reversedArrivals = calc.schedule(reversed, ALPHA, SERVICE, LocalTime.of(3, 30));
        assertThat(eddArrivals.get(0).plannedArrival()).isEqualTo(LocalTime.of(3, 50));
        assertThat(reversedArrivals.get(1).plannedArrival()).isEqualTo(LocalTime.of(5, 18));
        assertThat(eddArrivals.stream().noneMatch(ArrivalCalculator.ScheduledStop::isLate)).isTrue();
    }

    @Test void secondTripDepartsWhenTheFirstTripsLastServiceEndsIncludingWaiting() {
        var calc = new ArrivalCalculator();
        var first = trip(1, List.of(order(1, "07:30")));
        var second = trip(2, List.of(order(2, "07:30")));
        var day = calc.scheduleVehicleDay(List.of(second, first), d -> ALPHA, SERVICE, PlanConstraintParams.standard());
        assertThat(day).extracting(s -> s.trip().tripIndex()).containsExactly(1, 2);
        // 03:30 + 20 min = 03:50, wait to 05:00, 11 min service: free at 05:11 (trip minutes 31 + 70 waiting).
        assertThat(day.get(0).availableAfter()).isEqualTo(LocalTime.of(5, 11));
        assertThat(day.get(1).departure()).isEqualTo(LocalTime.of(5, 11));
        assertThat(day.get(1).stops().get(0).plannedArrival()).isEqualTo(LocalTime.of(5, 31));
    }

    private static PlanTrip trip(int index, List<PlanOrder> orders) {
        List<PlanStop> stops = new java.util.ArrayList<>();
        for (PlanOrder o : orders) stops.add(new PlanStop(0, o.id(), stops.size() + 1, o, null, null));
        return new PlanTrip(index, "VEH1", index, "Fresh", "Alpha", stops, null, null, null);
    }
}
