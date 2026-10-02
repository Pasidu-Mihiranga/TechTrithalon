-- Phase 3A: customer orders for the demo delivery day and later store/dispatcher flows.
CREATE TABLE customer_order (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ref              varchar(16) NOT NULL UNIQUE,
    outlet_id        varchar(8)  NOT NULL REFERENCES outlet(outlet_id),
    brand            varchar(12) NOT NULL,
    depot            varchar(20) NOT NULL,
    district         varchar(32) NOT NULL,
    order_date       date NOT NULL REFERENCES calendar_day(date),
    placed_at        timestamptz NOT NULL,
    confirmed_at     timestamptz,
    temp_requirement varchar(16) NOT NULL CHECK (temp_requirement IN ('chilled', 'ambient')),
    units            integer NOT NULL CHECK (units > 0),
    weight_kg        numeric(10,2) NOT NULL CHECK (weight_kg > 0),
    volume_m3        numeric(10,3) NOT NULL CHECK (volume_m3 > 0),
    status           varchar(24) NOT NULL CHECK (status IN (
        'draft', 'confirmed', 'planned', 'loaded', 'in_transit', 'delivered',
        'deferred', 'cancelled', 'failed', 'partial', 'receipt_confirmed'
    )),
    iso_year         smallint NOT NULL,
    iso_week         smallint NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
    placed_by        bigint REFERENCES app_user(id),
    version          integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL
);

CREATE INDEX ix_order_planning ON customer_order(order_date, depot, status);
CREATE INDEX ix_order_outlet   ON customer_order(outlet_id, order_date DESC);
CREATE INDEX ix_order_isoweek  ON customer_order(depot, brand, iso_year, iso_week);
