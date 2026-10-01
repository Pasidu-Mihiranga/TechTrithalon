package lk.techtrithalon.waypoint.identity.domain;

public enum Role {
    DISPATCHER, STORE_MANAGER, LOADER, DRIVER;

    /** The authority name Spring Security expects for hasRole(...). */
    public String authority() { return "ROLE_" + name(); }
}
