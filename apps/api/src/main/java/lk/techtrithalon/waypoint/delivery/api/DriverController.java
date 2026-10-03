package lk.techtrithalon.waypoint.delivery.api;

import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import lk.techtrithalon.waypoint.delivery.application.DriverService;
import lk.techtrithalon.waypoint.delivery.domain.DriverViews;
import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.shared.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** The driver's trips for a day (default: the demo operating day). Trips are addressed by slot, 1 or 2. */
@RestController
@RequestMapping("/api/v1/driver")
@SecurityRequirement(name="session")
class DriverController {
    private final DriverService service;
    DriverController(DriverService service) { this.service = service; }

    @GetMapping("/home")
    DriverViews.Home home(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date) {
        return service.home(user, date);
    }

    @GetMapping("/capabilities")
    DriverViews.Capabilities capabilities() { return service.capabilities(); }

    @GetMapping("/trips/{tripIndex}")
    DriverViews.TripDetail trip(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex,
                                @RequestParam(required=false) LocalDate date) {
        return service.trip(user, tripIndex, date);
    }

    @PostMapping("/trips/{tripIndex}/start")
    DriverViews.TripDetail start(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex,
                                 @RequestParam(required=false) LocalDate date, @Valid @RequestBody DriverRequests.Start request) {
        return service.start(user, tripIndex, date, request.planVersion());
    }

    @PostMapping("/trips/{tripIndex}/stops/{outletId}/arrive")
    DriverViews.TripDetail arrive(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex, @PathVariable String outletId,
                                  @RequestParam(required=false) LocalDate date, @Valid @RequestBody DriverRequests.Command request) {
        return service.arrive(user, tripIndex, outletId, date, request.expectedVersion());
    }

    @PostMapping("/trips/{tripIndex}/orders/{orderId}/outcome")
    DriverViews.TripDetail outcome(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex, @PathVariable long orderId,
                                   @RequestParam(required=false) LocalDate date, @Valid @RequestBody DriverRequests.Outcome request) {
        return service.record(user, tripIndex, orderId, date, new DriverService.OutcomeCommand(request.expectedVersion(), request.outcome(),
            request.deliveredUnits(), request.issueKind(), request.recipientName(), request.notes(), request.proofIds()));
    }

    /** A proof photo or signature (JPEG or PNG, at most 5 MB) for an order still to be recorded. */
    @PostMapping(path="/trips/{tripIndex}/orders/{orderId}/proofs", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DriverViews.PodUpload upload(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex, @PathVariable long orderId,
                                 @RequestParam(required=false) LocalDate date, @RequestParam String kind,
                                 @RequestPart("file") MultipartFile file) {
        try {
            return service.upload(user, tripIndex, orderId, date, kind, file.getBytes());
        } catch (IOException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "FILE_UNREADABLE", "The upload could not be read");
        }
    }

    @PostMapping("/trips/{tripIndex}/stops/{outletId}/depart")
    DriverViews.TripDetail depart(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex, @PathVariable String outletId,
                                  @RequestParam(required=false) LocalDate date, @Valid @RequestBody DriverRequests.Command request) {
        return service.depart(user, tripIndex, outletId, date, request.expectedVersion());
    }

    @PostMapping("/trips/{tripIndex}/complete")
    DriverViews.TripDetail complete(@AuthenticationPrincipal CurrentUser user, @PathVariable int tripIndex,
                                    @RequestParam(required=false) LocalDate date, @Valid @RequestBody DriverRequests.Command request) {
        return service.complete(user, tripIndex, date, request.expectedVersion());
    }

    @GetMapping("/deliveries")
    DriverViews.Deliveries deliveries(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate date) {
        return service.deliveries(user, date);
    }

    /** Trips the driver finished or started before {@code before} (default: the demo operating day), newest first. */
    @GetMapping("/past-trips")
    List<DriverViews.PastTrip> pastTrips(@AuthenticationPrincipal CurrentUser user, @RequestParam(required=false) LocalDate before) {
        return service.pastTrips(user, before);
    }

    @GetMapping("/orders/{orderId}")
    DriverViews.OrderDetail order(@AuthenticationPrincipal CurrentUser user, @PathVariable long orderId,
                                  @RequestParam(required=false) LocalDate date) {
        return service.order(user, orderId, date);
    }
}
