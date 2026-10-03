package lk.techtrithalon.waypoint.identity.domain;

/** The driver account linked to a vehicle; the name is copied onto trips at publication. */
public record AssignedDriver(long userId, String displayName) {}
