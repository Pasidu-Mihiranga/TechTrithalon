package lk.techtrithalon.waypoint.reference.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;

/**
 * District-level geography for maps. The competition data has no outlet or depot coordinates, so
 * nothing here locates an outlet: shapes are public district boundaries, depots are town-level
 * points, and every link carries the competition's own district travel figures.
 */
public record GeographyView(
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String attribution,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Depot> depots,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<District> districts,
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<Link> links
) {
    public record Depot(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double lat,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) double lng,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Why this point, and how approximate it is") String basis) {}

    public record District(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String district,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True when the competition data serves this district") boolean served,
        @Schema(nullable = true, description = "Serving depot; null for districts outside the competition data") String depot,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "[lng, lat] inside the largest part of the district, for its label") List<Double> labelPoint,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "GeoJSON Polygon or MultiPolygon") java.util.Map<String, Object> geometry) {}

    public record Link(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String district,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String depot,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal depotToDistrictKm,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int depotToDistrictMinutes,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) BigDecimal interStopKm,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) int interStopMinutes,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String roadClass) {}
}
