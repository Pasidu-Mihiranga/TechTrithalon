package lk.techtrithalon.waypoint.identity.domain;

/**
 * The signed-in actor. Later modules receive this (via {@code @AuthenticationPrincipal}) for audit and
 * ownership checks; they must never trust an id sent by the client.
 *
 * @param outletId set for store managers: the only outlet they may see or order for
 * @param depot    set for loaders (their depot) and optionally dispatchers (null = both depots)
 */
public record CurrentUser(long id, String username, String displayName, Role role, String outletId, String depot) {

    /** Data-scope check. Callers answer 404 (not 403) when this is false, so existence is not revealed. */
    public boolean canAccessOutlet(String candidateOutletId) {
        return switch (role) {
            case DISPATCHER -> depot == null;
            case STORE_MANAGER -> outletId != null && outletId.equals(candidateOutletId);
            case LOADER, DRIVER -> false;
        };
    }

    public boolean canAccessOutlet(String candidateOutletId, String candidateDepot) {
        return role == Role.DISPATCHER ? canAccessDepot(candidateDepot) : canAccessOutlet(candidateOutletId);
    }

    public boolean canAccessDepot(String candidateDepot) {
        return switch (role) {
            case DISPATCHER -> depot == null || depot.equals(candidateDepot);
            case LOADER -> depot != null && depot.equals(candidateDepot);
            case STORE_MANAGER, DRIVER -> false;
        };
    }
}
