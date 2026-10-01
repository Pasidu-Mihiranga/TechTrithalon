package lk.techtrithalon.waypoint.identity.api;

import lk.techtrithalon.waypoint.identity.domain.CurrentUser;
import lk.techtrithalon.waypoint.identity.domain.Role;

/** The signed-in user as the web client sees them. Never includes credentials. */
public record UserResponse(long id, String username, String displayName, Role role, String outletId, String depot) {
    static UserResponse from(CurrentUser user) {
        return new UserResponse(user.id(), user.username(), user.displayName(), user.role(), user.outletId(), user.depot());
    }
}
