package lk.techtrithalon.waypoint.ordering.domain;

import java.util.List;

public record OrderPage(List<CustomerOrder> items, long total, int page, int size) {}
