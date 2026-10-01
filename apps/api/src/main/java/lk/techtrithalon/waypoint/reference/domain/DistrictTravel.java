package lk.techtrithalon.waypoint.reference.domain;
import java.math.BigDecimal;
public record DistrictTravel(String district, String depot, String roadClass, BigDecimal freeFlowKmh,
    BigDecimal depotToDistrictKm, int depotToDistrictMinutes, BigDecimal interStopKm, int interStopMinutes) {}
