package lk.techtrithalon.waypoint.identity.domain;

/** A stored user, including the password hash. Never leaves the identity module. */
public record UserAccount(long id, String username, String displayName, String passwordHash,
                          Role role, String outletId, String depot, boolean active) {
    public CurrentUser toCurrentUser() {
        return new CurrentUser(id, username, displayName, role, outletId, depot);
    }
}
