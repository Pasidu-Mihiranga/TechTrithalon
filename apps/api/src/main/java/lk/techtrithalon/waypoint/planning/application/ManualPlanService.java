package lk.techtrithalon.waypoint.planning.application;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import lk.techtrithalon.waypoint.audit.application.AuditService;
import lk.techtrithalon.waypoint.fleetops.application.FleetService;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.application.DriverDirectory;
import lk.techtrithalon.waypoint.identity.domain.AssignedDriver;
import lk.techtrithalon.waypoint.loading.application.LoadTaskService;
import lk.techtrithalon.waypoint.loading.domain.LoadTaskStatus;
import lk.techtrithalon.waypoint.loading.domain.NewLoadTask;
import lk.techtrithalon.waypoint.ordering.application.OrderCommandService;
import lk.techtrithalon.waypoint.ordering.application.OrderQueryService;
import lk.techtrithalon.waypoint.ordering.domain.CustomerOrder;
import lk.techtrithalon.waypoint.planning.api.ManualPlanRequests;
import lk.techtrithalon.waypoint.planning.domain.*;
import lk.techtrithalon.waypoint.reference.application.ReferenceService;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@PreAuthorize("hasRole('DISPATCHER')")
public class ManualPlanService {
    private final ManualPlanRepository plans;
    private final PlanningSnapshotService snapshots;
    private final SnapshotPlanContextFactory contexts;
    private final AuditService audit;
    private final FleetService fleet;
    private final ReferenceService reference;
    private final Clock clock;
    private final OrderCommandService ordering;
    private final DeferralService deferrals;
    private final OrderQueryService orderQueries;
    private final DriverDirectory drivers;
    private final LoadTaskService loadTasks;
    private final PlanValidator validator=new PlanValidator();
    public ManualPlanService(ManualPlanRepository plans,PlanningSnapshotService snapshots,SnapshotPlanContextFactory contexts,
                             AuditService audit,FleetService fleet,ReferenceService reference,Clock clock,OrderCommandService ordering,
                             DeferralService deferrals,OrderQueryService orderQueries,DriverDirectory drivers,LoadTaskService loadTasks) {
        this.plans=plans; this.snapshots=snapshots; this.contexts=contexts; this.audit=audit;
        this.fleet=fleet; this.reference=reference; this.clock=clock;
        this.ordering=ordering; this.deferrals=deferrals;
        this.orderQueries=orderQueries; this.drivers=drivers; this.loadTasks=loadTasks;
    }
    /**
     * Creates a candidate. When the run already has a published version, the candidate is a revision
     * of it and, unless {@code startFrom} is "empty", starts from a copy of its trips.
     */
    @Transactional
    public ManualPlanView create(CurrentUser user,long snapshotId,String reason,String startFrom) {
        var snapshot=snapshots.get(user,snapshotId);
        requireFresh(user,snapshotId);
        var context=contexts.create(snapshot,List.of());
        requireFeasible(context);
        plans.lockScope(snapshot.planDate(),snapshot.depot());
        Long current=plans.currentPublished(snapshot.planDate(),snapshot.depot()).orElse(null);
        List<ManualPlan.TripAssignment> copied=List.of();
        if (current!=null && !"empty".equals(startFrom)) {
            var base=plans.find(current,false).orElseThrow();
            var members=new HashSet<>(snapshot.orderIds());
            copied=base.trips().stream().map(t -> new ManualPlan.TripAssignment(0,t.vehicleId(),t.tripIndex(),t.brand(),t.district(),
                t.orderIds().stream().filter(members::contains).toList())).filter(t -> !t.orderIds().isEmpty()).toList();
            var report=validateContext(contexts.create(snapshot,copied));
            if (!report.feasible()) throw new ManualPlanValidationException(report,"REVISION_COPY_INFEASIBLE",
                "The published trips no longer pass every rule with the current inputs; start the revision empty instead");
        }
        var plan=plans.create(snapshotId,snapshot.planDate(),snapshot.depot(),user.id(),clock.instant(),current);
        if (!copied.isEmpty()) {
            plans.replace(plan,copied,List.of(),clock.instant());
            plan=plans.find(plan.id(),false).orElseThrow();
        }
        audit.record(current==null?"plan.candidate.created":"plan.revision.created",user,"plan",String.valueOf(plan.id()),null,plan,reason);
        return view(user,plan);
    }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public ManualPlanView get(CurrentUser user,long id) { return view(user,load(user,id,false)); }
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public List<ManualPlanView> list(CurrentUser user,LocalDate date,String depot) {
        reference.day(date);
        String selected=depot==null || depot.isBlank()?user.depot():depot;
        if (selected!=null && !user.canAccessDepot(selected)) throw missing();
        return plans.list(date,selected).stream().map(id -> view(user,load(user,id,false))).toList();
    }
    @Transactional
    public ManualPlanView replace(CurrentUser user,long id,ManualPlanRequests.Replace request) {
        var plan=editable(user,id,request.expectedVersion());
        var trips=request.trips().stream().map(t -> new ManualPlan.TripAssignment(t.id()==null?0:t.id(),t.vehicleId(),
            t.tripIndex(),t.brand(),t.district(),t.orderIds())).toList();
        var reasons=request.dispositions().stream().map(d -> new ManualPlan.OrderDisposition(d.orderId(),d.code(),d.reason(),d.nextDeliveryDate(),
            "DEFERRED".equals(d.code())?d.reasonCode():null,!Boolean.FALSE.equals(d.protectNextRun()),!Boolean.FALSE.equals(d.notifyStore()),
            null,null,null)).toList();
        return apply(user,plan,trips,reasons,request.reason(),null);
    }
    @Transactional
    public ManualPlanView addTrip(CurrentUser user,long id,ManualPlanRequests.AddTrip request) {
        var plan=editable(user,id,request.expectedVersion());
        if (request.trip().id()!=null) throw failure(HttpStatus.BAD_REQUEST,"TRIP_ID_NOT_ALLOWED","New trips must omit their ID");
        var trips=new ArrayList<>(plan.trips()); var t=request.trip();
        // A new trip has no dispatcher sequence yet: its stops start in the default EDD order.
        var sequenced=StopSequencer.defaultSequence(t.orderIds(),snapshotOrders(user,plan));
        trips.add(new ManualPlan.TripAssignment(0,t.vehicleId(),t.tripIndex(),t.brand(),t.district(),sequenced));
        var reasons=plan.dispositions().stream().filter(d -> !t.orderIds().contains(d.orderId())).toList();
        return apply(user,plan,trips,reasons,request.reason(),null);
    }
    @Transactional
    public ManualPlanView move(CurrentUser user,long id,ManualPlanRequests.Move request) {
        var plan=editable(user,id,request.expectedVersion()); requireOrder(user,plan,request.orderId());
        var source=plan.trips().stream().filter(t -> t.orderIds().contains(request.orderId())).findFirst();
        if (source.isPresent() && request.fromTripId()==null)
            throw failure(HttpStatus.CONFLICT,"ORDER_ALREADY_ASSIGNED","Provide the current trip when moving an assigned order");
        if (request.fromTripId()!=null && (source.isEmpty() || source.get().id()!=request.fromTripId())) throw missing();
        if (request.toTripId()!=null) requireTrip(plan,request.toTripId());
        List<ManualPlan.TripAssignment> trips=new ArrayList<>();
        var snapshotOrders=request.position()==null && request.toTripId()!=null ? snapshotOrders(user,plan) : Map.<Long,PlanOrder>of();
        for (var trip : plan.trips()) {
            var orders=new ArrayList<>(trip.orderIds()); orders.remove(request.orderId());
            if (request.toTripId()!=null && trip.id()==request.toTripId()) {
                // An explicit position is the dispatcher's sequence; without one the order takes its EDD slot.
                int position=request.position()==null
                    ? StopSequencer.defaultInsertionIndex(orders,request.orderId(),snapshotOrders) : request.position()-1;
                if (position>orders.size()) throw failure(HttpStatus.BAD_REQUEST,"INVALID_POSITION","Position is outside the target trip");
                orders.add(position,request.orderId());
            }
            trips.add(withOrders(trip,orders));
        }
        var reasons=new ArrayList<>(plan.dispositions()); reasons.removeIf(d -> d.orderId()==request.orderId());
        if (request.toTripId()==null) reasons.add(new ManualPlan.OrderDisposition(request.orderId(),"UNASSIGNED",request.reason(),null));
        return apply(user,plan,trips,reasons,request.reason(),null);
    }
    @Transactional
    public ManualPlanView vehicle(CurrentUser user,long id,long tripId,ManualPlanRequests.Vehicle request) {
        var plan=editable(user,id,request.expectedVersion()); requireTrip(plan,tripId);
        var trips=plan.trips().stream().map(t -> t.id()==tripId?new ManualPlan.TripAssignment(t.id(),request.vehicleId(),request.tripIndex(),t.brand(),t.district(),t.orderIds()):t).toList();
        return apply(user,plan,trips,plan.dispositions(),request.reason(),null);
    }
    @Transactional
    public ManualPlanView sequence(CurrentUser user,long id,long tripId,ManualPlanRequests.Sequence request) {
        var plan=editable(user,id,request.expectedVersion()); var target=requireTrip(plan,tripId);
        if (request.orderIds().size()!=target.orderIds().size() || !new HashSet<>(request.orderIds()).equals(new HashSet<>(target.orderIds()))
                || new HashSet<>(request.orderIds()).size()!=request.orderIds().size())
            throw failure(HttpStatus.BAD_REQUEST,"INVALID_SEQUENCE","The sequence must contain every existing stop exactly once");
        var trips=plan.trips().stream().map(t -> t.id()==tripId?withOrders(t,request.orderIds()):t).toList();
        var info=new ConstraintViolation("MANUAL_SEQUENCE",Severity.INFO,Scope.TRIP,EntityType.TRIP,String.valueOf(tripId),
            "Manual stop order was revalidated against every delivery window",request.orderIds().toString(),
            "Earliest-deadline-first is the default heuristic","REVIEW_SEQUENCE",Map.of("tripId",tripId));
        return apply(user,plan,trips,plan.dispositions(),request.reason(),info);
    }
    @Transactional
    public ManualPlanView defer(CurrentUser user,long id,long orderId,ManualPlanRequests.Defer request,boolean restore) {
        var plan=editable(user,id,request.expectedVersion()); requireOrder(user,plan,orderId);
        if (request.nextDeliveryDate()!=null && (!request.nextDeliveryDate().isAfter(plan.planDate()) || !reference.day(request.nextDeliveryDate()).operating()))
            throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"DEFERRAL_DATE","A deferral date must be a later operating day");
        var trips=plan.trips().stream().map(t -> withOrders(t,t.orderIds().stream().filter(o -> o!=orderId).toList())).toList();
        var reasons=new ArrayList<>(plan.dispositions()); reasons.removeIf(d -> d.orderId()==orderId);
        reasons.add(restore ? new ManualPlan.OrderDisposition(orderId,"UNASSIGNED",request.reason(),null)
            : new ManualPlan.OrderDisposition(orderId,"DEFERRED",request.reason(),request.nextDeliveryDate(),request.reasonCode(),
                !Boolean.FALSE.equals(request.protectNextRun()),!Boolean.FALSE.equals(request.notifyStore()),null,null,null));
        return apply(user,plan,trips,reasons,request.reason(),null);
    }
    @Transactional
    public ManualPlanView removeTrip(CurrentUser user,long id,long tripId,ManualPlanRequests.Command request) {
        var plan=editable(user,id,request.expectedVersion()); var target=requireTrip(plan,tripId);
        var reasons=new ArrayList<>(plan.dispositions()); reasons.removeIf(d -> target.orderIds().contains(d.orderId()));
        target.orderIds().forEach(o -> reasons.add(new ManualPlan.OrderDisposition(o,"UNASSIGNED",request.reason(),null)));
        return apply(user,plan,plan.trips().stream().filter(t -> t.id()!=tripId).toList(),reasons,request.reason(),null);
    }
    /**
     * Operational publication, in one transaction: revalidate the persisted candidate, account for
     * every order, replace the current version (if any), reserve fuel exactly once, freeze the schedule
     * on trip and stop rows, assign drivers, create load tasks and write the audit trail.
     */
    @Transactional
    public ManualPlanView publish(CurrentUser user,long id,ManualPlanRequests.Command request) {
        var plan=editable(user,id,request.expectedVersion());
        plans.lockScope(plan.planDate(),plan.depot());
        Long current=plans.currentPublished(plan.planDate(),plan.depot()).orElse(null);
        if (!Objects.equals(current,plan.basedOnPlanId())) {
            String message=current==null ? "The version this candidate revises is no longer published; create a new candidate"
                : "Version "+plans.find(current,false).orElseThrow().version()+" was published after this candidate was created; create a revision of it";
            throw failure(HttpStatus.CONFLICT,"STALE_BASE",message);
        }
        if (plan.trips().stream().anyMatch(t -> t.orderIds().isEmpty()))
            throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"EMPTY_TRIP","Remove trips without stops before publication");
        var comparison=snapshots.compare(user,plan.snapshotId());
        if (!((List<?>)comparison.get("newEligibleOrderIds")).isEmpty())
            throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"ORDER_ACCOUNTING","Every closed order must be included or explicitly deferred before publication");
        var snapshot=snapshots.get(user,plan.snapshotId());
        var context=contexts.create(snapshot,plan.trips());
        var assigned=context.trips().stream().flatMap(t -> t.stops().stream()).map(PlanStop::orderId).collect(java.util.stream.Collectors.toSet());
        var accounted=plan.dispositions().stream().map(ManualPlan.OrderDisposition::orderId).collect(java.util.stream.Collectors.toSet());
        if (context.orders().stream().anyMatch(o -> !assigned.contains(o.id()) && !accounted.contains(o.id())))
            throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"ORDER_ACCOUNTING","Every unassigned order needs an explicit reason");
        // Publication closes the run: an order left off every trip must be explicitly deferred to a later run.
        if (plan.dispositions().stream().anyMatch(d -> !"DEFERRED".equals(d.code())))
            throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"ORDER_NOT_DEFERRED","Assign or explicitly defer every order before publication");
        // Fuel already reserved by the version being replaced; it is returned, not added to.
        Map<String,BigDecimal> replaced=current==null ? Map.of() : plans.publishedFuelByVehicle(current);
        var vehicles=new TreeSet<String>(replaced.keySet());
        plan.trips().forEach(t -> vehicles.add(t.vehicleId()));
        fleet.lockPlanningFuel(user,List.copyOf(vehicles),plan.planDate());
        requireFresh(user,plan.snapshotId());
        Map<String,BigDecimal> committed=new HashMap<>();
        for (var vehicle : context.vehicles()) {
            var balance=fleet.fuel(user,vehicle.vehicleId(),plan.planDate());
            var ledger=balance.committedLitres()==null?BigDecimal.ZERO:balance.committedLitres();
            committed.put(vehicle.vehicleId(),ledger.subtract(replaced.getOrDefault(vehicle.vehicleId(),BigDecimal.ZERO)).max(BigDecimal.ZERO));
        }
        context=new PlanContext(context.planDate(),context.depot(),context.orders(),context.vehicles(),context.trips(),
            context.travelByDistrict(),context.serviceByBrandDock(),committed,context.calendar(),context.constraintParams());
        requireFeasible(context);
        Map<String,BigDecimal> usage=new TreeMap<>();
        for (var trip : context.trips()) usage.merge(trip.vehicleId(),trip.fuelLitres(),BigDecimal::add);
        fleet.releasePlanningFuel(user,replaced,plan.planDate());
        fleet.commitPlanningFuel(user,usage,plan.planDate());
        ordering.markPlanned(user,assigned.stream().sorted().toList(),request.reason());
        var deferred=plan.dispositions().stream().sorted(Comparator.comparingLong(ManualPlan.OrderDisposition::orderId)).toList();
        deferrals.recordPublished(user,plan,deferred);
        for (var d : deferred) ordering.markDeferred(user,d.orderId(),deferrals.nextRun(plan.planDate(),d.nextDeliveryDate()),d.reason());
        var now=clock.instant();
        if (current!=null) {
            loadTasks.supersedeForPlan(user,current,id);
            plans.supersede(current,id,now);
        }
        plans.publish(plan,user.id(),now,String.valueOf(snapshot.constraints().get("ruleVersion")));
        freezeSchedule(user,plan,context);
        var after=plans.find(id,false).orElseThrow();
        var published=view(user,after);
        Map<String,Object> record=new LinkedHashMap<>();
        record.put("plan",after); record.put("supersededPlanId",current);
        record.put("trips",published.published()); record.put("metrics",published.validation().metrics());
        if (current!=null) audit.record("plan.superseded",user,"plan",String.valueOf(current),Map.of("status","published"),
            Map.of("status","superseded","supersededByPlanId",id),request.reason());
        audit.record("plan.published",user,"plan",String.valueOf(id),plan,record,request.reason());
        return published;
    }

    /** Persists the validated schedule, the vehicle's driver and one load task per trip. */
    private void freezeSchedule(CurrentUser user,ManualPlan plan,PlanContext context) {
        var departures=contexts.departures(context);
        var orderIds=context.trips().stream().flatMap(t -> t.stops().stream()).map(PlanStop::orderId).toList();
        Map<Long,CustomerOrder> orders=new HashMap<>();
        orderQueries.ordersByIds(user,orderIds).forEach(o -> orders.put(o.id(),o));
        List<NewLoadTask> tasks=new ArrayList<>();
        for (var trip : context.trips()) {
            var driver=drivers.driverFor(trip.vehicleId());
            var depart=departures.get(trip.id());
            plans.freezeTrip(trip.id(),depart,trip.tripMinutes(),trip.distanceKm(),trip.fuelLitres(),
                driver.map(AssignedDriver::userId).orElse(null),driver.map(AssignedDriver::displayName).orElse(null));
            List<NewLoadTask.Line> lines=new ArrayList<>();
            for (var stop : trip.stops()) {
                plans.freezeStop(trip.id(),stop.orderId(),stop.plannedArrival(),stop.serviceStart());
                var order=orders.get(stop.orderId());
                if (order==null) throw missing();
                lines.add(new NewLoadTask.Line(order.id(),order.ref(),order.outletId(),order.tempRequirement(),order.units(),
                    order.weightKg(),order.volumeM3(),stop.stopIndex()));
            }
            tasks.add(new NewLoadTask(plan.id(),plan.version(),trip.id(),plan.planDate(),plan.depot(),trip.vehicleId(),
                trip.tripIndex(),trip.brand(),trip.district(),depart,driver.map(AssignedDriver::userId).orElse(null),lines));
        }
        loadTasks.createForPublication(user,tasks);
    }

    /**
     * What this plan changes against the published version it revises: per order (added, removed,
     * moved, resequenced, unchanged) and per vehicle trip (stops or driver). The first version of a run
     * lists every assigned order as added.
     */
    @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
    public PlanChanges changes(CurrentUser user,long id) {
        var plan=load(user,id,false);
        var base=plan.basedOnPlanId()==null ? null : plans.find(plan.basedOnPlanId(),false).orElseThrow();
        var before=placements(base); var after=placements(plan);
        var ids=new TreeSet<Long>(); ids.addAll(before.keySet()); ids.addAll(after.keySet());
        Map<Long,CustomerOrder> rows=new HashMap<>();
        if (!ids.isEmpty()) orderQueries.ordersByIds(user,List.copyOf(ids)).forEach(o -> rows.put(o.id(),o));
        List<PlanChanges.OrderChange> orders=new ArrayList<>();
        int added=0,removed=0,moved=0,resequenced=0,unchanged=0;
        for (long orderId : ids) {
            var b=before.get(orderId); var a=after.get(orderId);
            String change;
            if (b==null) { change="ADDED"; added++; }
            else if (a==null) { change="REMOVED"; removed++; }
            else if (!b.vehicleId().equals(a.vehicleId()) || b.tripIndex()!=a.tripIndex()) { change="MOVED"; moved++; }
            else if (b.seq()!=a.seq()) { change="RESEQUENCED"; resequenced++; }
            else { change="UNCHANGED"; unchanged++; }
            var row=rows.get(orderId);
            orders.add(new PlanChanges.OrderChange(orderId,row==null?null:row.ref(),row==null?null:row.outletId(),change,b,a));
        }
        var driversBefore=driverNames(base,false); var driversAfter=driverNames(plan,!"candidate".equals(plan.status()));
        var stopsBefore=tripStops(base); var stopsAfter=tripStops(plan);
        var slots=new TreeSet<String>(); slots.addAll(stopsBefore.keySet()); slots.addAll(stopsAfter.keySet());
        List<PlanChanges.TripChange> trips=new ArrayList<>();
        int tripsAdded=0,tripsRemoved=0,driversChanged=0;
        for (var slot : slots) {
            var parts=slot.split(":"); String vehicle=parts[0]; int index=Integer.parseInt(parts[1]);
            String db=driversBefore.get(slot), da=driversAfter.get(slot);
            String change;
            if (!stopsBefore.containsKey(slot)) { change="ADDED"; tripsAdded++; }
            else if (!stopsAfter.containsKey(slot)) { change="REMOVED"; tripsRemoved++; }
            else {
                boolean driverChanged=!Objects.equals(db,da);
                if (driverChanged) driversChanged++;
                change=driverChanged || !stopsBefore.get(slot).equals(stopsAfter.get(slot)) ? "CHANGED" : "UNCHANGED";
            }
            trips.add(new PlanChanges.TripChange(vehicle,index,change,db,da));
        }
        return new PlanChanges(plan.id(),plan.version(),base==null?null:base.id(),base==null?null:base.version(),base==null,
            new PlanChanges.Summary(added,removed,moved,resequenced,unchanged,tripsAdded,tripsRemoved,driversChanged),orders,trips);
    }
    private static Map<Long,PlanChanges.Placement> placements(ManualPlan plan) {
        Map<Long,PlanChanges.Placement> result=new HashMap<>();
        if (plan==null) return result;
        for (var t : plan.trips()) for (int i=0;i<t.orderIds().size();i++)
            result.put(t.orderIds().get(i),new PlanChanges.Placement(t.vehicleId(),t.tripIndex(),i+1));
        return result;
    }
    private static Map<String,List<Long>> tripStops(ManualPlan plan) {
        Map<String,List<Long>> result=new TreeMap<>();
        if (plan!=null) plan.trips().forEach(t -> result.put(t.vehicleId()+":"+t.tripIndex(),t.orderIds()));
        return result;
    }
    /** Published plans keep the driver frozen at publication; a candidate shows who publication would assign. */
    private Map<String,String> driverNames(ManualPlan plan,boolean frozen) {
        Map<String,String> result=new HashMap<>();
        if (plan==null) return result;
        if (frozen || !"candidate".equals(plan.status())) {
            plans.publishedTrips(plan.id()).forEach(t -> result.put(t.vehicleId()+":"+t.tripIndex(),t.driverName()));
            return result;
        }
        plan.trips().forEach(t -> drivers.driverFor(t.vehicleId()).ifPresent(d -> result.put(t.vehicleId()+":"+t.tripIndex(),d.displayName())));
        return result;
    }
    private ManualPlan editable(CurrentUser user,long id,int expected) {
        var plan=load(user,id,true);
        if (!"candidate".equals(plan.status())) throw failure(HttpStatus.CONFLICT,"PLAN_LOCKED","Published plans cannot be edited");
        if (plan.lockVersion()!=expected) throw failure(HttpStatus.CONFLICT,"STALE_PLAN","The plan changed; reload before editing");
        requireFresh(user,plan.snapshotId()); return plan;
    }
    private ManualPlan load(CurrentUser user,long id,boolean lock) {
        var plan=plans.find(id,lock).orElseThrow(ManualPlanService::missing);
        if (!user.canAccessDepot(plan.depot())) throw missing(); return plan;
    }
    private void requireFresh(CurrentUser user,long snapshotId) {
        if (!Boolean.TRUE.equals(snapshots.compare(user,snapshotId).get("unchanged")))
            throw failure(HttpStatus.CONFLICT,"SNAPSHOT_CHANGED","Planning inputs changed; create a fresh snapshot and candidate");
    }
    private ManualPlanView apply(CurrentUser user,ManualPlan plan,List<ManualPlan.TripAssignment> trips,
                                  List<ManualPlan.OrderDisposition> reasons,String reason,ConstraintViolation info) {
        for (var t : trips) if (t.id()>0) requireTrip(plan,t.id());
        if (trips.stream().filter(t -> t.id()>0).map(ManualPlan.TripAssignment::id).distinct().count()!=trips.stream().filter(t -> t.id()>0).count())
            throw failure(HttpStatus.BAD_REQUEST,"DUPLICATE_TRIP","Each trip ID must occur once");
        Set<Long> assigned=new HashSet<>(); trips.forEach(t -> assigned.addAll(t.orderIds()));
        Set<Long> dispositions=new HashSet<>();
        Map<Long,ManualPlan.OrderDisposition> previous=new HashMap<>(); plan.dispositions().forEach(d -> previous.put(d.orderId(),d));
        var now=clock.instant();
        reasons=reasons.stream().map(d -> {
            var before=previous.get(d.orderId());
            if (d.sameDecision(before) && before.decidedBy()!=null) return before;
            return d.decidedBy(user.id(),user.displayName(),now);
        }).toList();
        for (var d : reasons) {
            if ("DEFERRED".equals(d.code()) && d.reasonCode()==null)
                throw failure(HttpStatus.BAD_REQUEST,"REASON_CODE_REQUIRED","Choose a deferral reason");
            requireOrder(user,plan,d.orderId());
            if (!dispositions.add(d.orderId()) || assigned.contains(d.orderId()))
                throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"ORDER_ACCOUNTING","An order cannot be both assigned and deferred or have two reasons");
            if (d.nextDeliveryDate()!=null && (!d.nextDeliveryDate().isAfter(plan.planDate()) || !reference.day(d.nextDeliveryDate()).operating()))
                throw failure(HttpStatus.UNPROCESSABLE_ENTITY,"DEFERRAL_DATE","A deferral date must be a later operating day");
        }
        var context=contexts.create(snapshots.get(user,plan.snapshotId()),trips);
        requireFeasible(context);
        Set<String> slots=new HashSet<>();
        for (var trip : trips) if (!slots.add(trip.vehicleId()+":"+trip.tripIndex()))
            throw new ManualPlanValidationException(new PlanValidationReport(List.of(new ConstraintViolation("TRIP_COUNT",Severity.HARD,
                Scope.VEHICLE_DAY,EntityType.VEHICLE,trip.vehicleId(),"Two trips occupy the same vehicle slot","duplicate slot","one trip per slot",
                "CHOOSE_FREE_TRIP_SLOT",Map.of("tripIndex",trip.tripIndex()))),false,validator.validate(context).metrics()));
        plans.replace(plan,trips,reasons,clock.instant());
        var after=plans.find(plan.id(),false).orElseThrow();
        audit.record("plan.manual.edited",user,"plan",String.valueOf(plan.id()),plan,after,reason);
        var result=view(user,after);
        if (info==null) return result;
        var violations=new ArrayList<>(result.validation().violations()); violations.add(info);
        return new ManualPlanView(result.plan(),new PlanValidationReport(violations,true,result.validation().metrics()),
            result.trips(),result.unassignedOrders(),result.fleet(),result.utilisation(),result.vehicleUtilisation(),result.fairness(),result.published());
    }
    private PlanValidationReport requireFeasible(PlanContext context) {
        var report=validateContext(context);
        if (!report.feasible()) throw new ManualPlanValidationException(report);
        return report;
    }
    private PlanValidationReport validateContext(PlanContext context) {
        // R8 schedules waiting across a vehicle's trips itself; the validator is the single lateness authority.
        return validator.validate(context);
    }
    private ManualPlanView view(CurrentUser user,ManualPlan plan) {
        var context=contexts.create(snapshots.get(user,plan.snapshotId()),plan.trips());
        var report=validateContext(context);
        Set<Long> assigned=new HashSet<>(); context.trips().forEach(t -> t.stops().forEach(s -> assigned.add(s.orderId())));
        Map<Long,ManualPlan.OrderDisposition> reasons=new HashMap<>(); plan.dispositions().forEach(d -> reasons.put(d.orderId(),d));
        var unassigned=context.orders().stream().filter(o -> !assigned.contains(o.id())).map(o -> {
            var d=reasons.get(o.id());
            return d==null ? new ManualPlanView.UnassignedOrder(o,"UNASSIGNED",null,null,null,true,true,null,null)
                : new ManualPlanView.UnassignedOrder(o,d.code(),d.reason(),d.nextDeliveryDate(),d.reasonCode(),d.protectNextRun(),
                    d.notifyStore(),d.decidedByName(),d.decidedAt());
        }).toList();
        Map<Long,ManualPlanView.TripLoad> loads=new LinkedHashMap<>();
        for (var trip : context.trips()) {
            var vehicle=context.vehicles().stream().filter(v -> v.vehicleId().equals(trip.vehicleId())).findFirst().orElseThrow();
            var volume=trip.stops().stream().map(s -> s.order().volumeM3()).reduce(BigDecimal.ZERO,BigDecimal::add);
            var volumePct=vehicle.volumeCapM3()!=null && vehicle.volumeCapM3().signum()>0
                ? volume.multiply(BigDecimal.valueOf(100)).divide(vehicle.volumeCapM3(),2,java.math.RoundingMode.HALF_UP) : null;
            loads.put(trip.id(),new ManualPlanView.TripLoad(volume,
                vehicle.volumeCapM3(),trip.stops().stream().map(s -> s.order().weightKg()).reduce(BigDecimal.ZERO,BigDecimal::add),vehicle.weightCapKg(),
                volumePct,trip.stops().size()));
        }
        Map<String,ManualPlanView.VehicleUse> vehicleUse=new LinkedHashMap<>();
        for (var vehicle : context.vehicles()) {
            var trips=context.trips().stream().filter(t -> t.vehicleId().equals(vehicle.vehicleId())).toList();
            vehicleUse.put(vehicle.vehicleId(),new ManualPlanView.VehicleUse(
                trips.stream().filter(t -> "Fresh".equalsIgnoreCase(t.brand())).mapToInt(PlanTrip::tripMinutes).sum(),context.constraintParams().freshBudgetMinutes(),
                trips.stream().filter(t -> !"Fresh".equalsIgnoreCase(t.brand())).mapToInt(PlanTrip::tripMinutes).sum(),context.constraintParams().otherBudgetMinutes(),
                context.fuelCommittedThisWeek().getOrDefault(vehicle.vehicleId(),BigDecimal.ZERO),
                trips.stream().map(PlanTrip::fuelLitres).reduce(BigDecimal.ZERO,BigDecimal::add),vehicle.weeklyFuelQuotaL()));
        }
        var fairness=deferrals.fairness(user,plan.planDate(),context.orders().stream().map(PlanOrder::id).toList());
        List<PublishedTrip> published=List.of();
        if (!"candidate".equals(plan.status())) {
            Map<Long,LoadTaskStatus> load=new HashMap<>();
            loadTasks.statusForPlan(user,plan.id()).forEach(t -> load.put(t.tripId(),t));
            published=plans.publishedTrips(plan.id()).stream().map(t -> {
                var task=load.get(t.tripId());
                return task==null ? t : t.withLoad(task.loadTaskId(),task.status());
            }).toList();
        }
        return new ManualPlanView(plan,report,context.trips(),unassigned,context.vehicles(),loads,vehicleUse,fairness,published);
    }
    private Map<Long,PlanOrder> snapshotOrders(CurrentUser user,ManualPlan plan) {
        Map<Long,PlanOrder> orders=new HashMap<>();
        contexts.create(snapshots.get(user,plan.snapshotId()),List.of()).orders().forEach(o -> orders.put(o.id(),o));
        return orders;
    }
    private void requireOrder(CurrentUser user,ManualPlan plan,long orderId) {
        if (!snapshots.get(user,plan.snapshotId()).orderIds().contains(orderId)) throw missing();
    }
    private static ManualPlan.TripAssignment requireTrip(ManualPlan plan,long id) {
        return plan.trips().stream().filter(t -> t.id()==id).findFirst().orElseThrow(ManualPlanService::missing);
    }
    private static ManualPlan.TripAssignment withOrders(ManualPlan.TripAssignment trip,List<Long> ids) {
        return new ManualPlan.TripAssignment(trip.id(),trip.vehicleId(),trip.tripIndex(),trip.brand(),trip.district(),ids);
    }
    private static ApiException missing() { return failure(HttpStatus.NOT_FOUND,"NOT_FOUND","Resource not found"); }
    private static ApiException failure(HttpStatus status,String code,String message) { return new ApiException(status,code,message); }
}
