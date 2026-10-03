package lk.techtrithalon.waypoint.loading.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/** Read models for the loader screens. Counts and totals are computed here, never in the browser. */
public final class LoaderViews {
    private LoaderViews() {}

    @Schema(name="LoaderBoard")
    public record Board(LocalDate planDate, String depot,
                        @Schema(nullable=true, description="Version of the current published plan; null when nothing is published")
                        Integer planVersion,
                        Summary summary, List<TripCard> trips,
                        @Schema(nullable=true) TripCard nextDeparture,
                        List<LoadingIssue> openIssues) {}

    @Schema(name="LoaderSummary")
    public record Summary(int tripsAssigned, int ordersToLoad, int ordersLoaded, int openIssues) {}

    /** One trip on the loader's home: progress, capacity and whether it can be handed over. */
    @Schema(name="LoaderTripCard")
    public record TripCard(long loadTaskId, String vehicleId, int tripIndex, String brand, String district,
                           LocalTime plannedDepart, int planVersion, String status,
                           @Schema(nullable=true) String driverName,
                           int stops, int orders, int ordersChecked, int stopsLoaded,
                           BigDecimal volumeM3, @Schema(nullable=true) BigDecimal volumeCapM3,
                           BigDecimal weightKg, @Schema(nullable=true) BigDecimal weightCapKg,
                           boolean held, boolean awaitingAcknowledgement, int openIssues) {}

    /** A delivery stop: consecutive orders for the same outlet. Loaded in reverse delivery order. */
    @Schema(name="LoaderStop")
    public record Stop(int stopNumber, int loadPosition, String outletId, String district, List<LoadLine> lines,
                       BigDecimal volumeM3, BigDecimal weightKg,
                       @Schema(description="pending, partial or loaded (every order counted)") String status) {}

    /** What a republished manifest changes for this vehicle and trip compared with the one it replaced. */
    @Schema(name="LoaderManifestChange")
    public record ManifestChange(String orderRef, String outletId,
                                 @Schema(description="ADDED, REMOVED (take off the vehicle if loaded) or RESEQUENCED") String change,
                                 @Schema(nullable=true) Integer stopBefore, @Schema(nullable=true) Integer stopAfter,
                                 @Schema(nullable=true, description="Units already on the vehicle from the replaced manifest") Integer loadedUnits) {}

    @Schema(name="LoaderTaskDetail")
    public record Detail(LoadTask task, TripCard card, List<Stop> stops,
                         @Schema(nullable=true) Integer replacedPlanVersion,
                         List<ManifestChange> changes, List<LoadingIssue> issues,
                         @Schema(nullable=true, description="When this manifest was superseded: the task that replaced it")
                         Long currentTaskId,
                         @Schema(description="Why the trip cannot be marked loaded yet; empty when it can") List<String> handoverBlockers) {}

    /** Groups lines (in stop order) into delivery stops; returns them in loading order (last stop first). */
    public static List<Stop> stops(List<LoadLine> lines, java.util.function.Function<String, String> districtOf) {
        List<LoadLine> byStop = new ArrayList<>(lines);
        byStop.sort(java.util.Comparator.comparingInt(LoadLine::stopSeq));
        List<List<LoadLine>> groups = new ArrayList<>();
        for (var line : byStop) {
            if (!groups.isEmpty() && groups.getLast().getFirst().outletId().equals(line.outletId())) groups.getLast().add(line);
            else groups.add(new ArrayList<>(List.of(line)));
        }
        List<Stop> result = new ArrayList<>();
        int total = groups.size();
        for (int i = 0; i < total; i++) {
            var group = groups.get(i);
            long counted = group.stream().filter(l -> !"pending".equals(l.status())).count();
            String status = counted == 0 ? "pending" : counted == group.size() ? "loaded" : "partial";
            result.add(new Stop(i + 1, total - i, group.getFirst().outletId(), districtOf.apply(group.getFirst().outletId()),
                List.copyOf(group), sum(group, true), sum(group, false), status));
        }
        result.sort(java.util.Comparator.comparingInt(Stop::loadPosition));
        return result;
    }

    private static BigDecimal sum(List<LoadLine> lines, boolean volume) {
        return lines.stream().map(l -> volume ? l.volumeM3() : l.weightKg()).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
