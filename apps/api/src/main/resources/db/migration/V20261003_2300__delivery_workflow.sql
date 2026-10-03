-- Driver workflow: a trip the driver runs (one per vehicle, trip slot and day, stable across plan
-- versions), arrival and departure at each stop, one outcome per order, and proof-of-delivery files.
-- Additive only. Photos and signatures live in object storage; only their keys are stored here.

CREATE TABLE delivery_trip (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_date date NOT NULL REFERENCES calendar_day(date),
    depot varchar(32) NOT NULL,
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    trip_index smallint NOT NULL CHECK (trip_index IN (1, 2)),
    driver_user_id bigint NOT NULL REFERENCES app_user(id),
    -- The plan version the driver started on; stops are always read from the current version.
    started_plan_version integer NOT NULL CHECK (started_plan_version > 0),
    status varchar(16) NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (plan_date, vehicle_id, trip_index),
    CONSTRAINT delivery_trip_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX ix_delivery_trip_driver ON delivery_trip(driver_user_id, plan_date);
CREATE INDEX ix_delivery_trip_run ON delivery_trip(plan_date, depot);

-- A stop is the run of consecutive orders for one outlet on a trip.
CREATE TABLE stop_visit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_trip_id bigint NOT NULL REFERENCES delivery_trip(id),
    outlet_id varchar(8) NOT NULL REFERENCES outlet(outlet_id),
    arrived_at timestamptz NOT NULL,
    arrived_by bigint NOT NULL REFERENCES app_user(id),
    departed_at timestamptz,
    departed_by bigint REFERENCES app_user(id),
    UNIQUE (delivery_trip_id, outlet_id),
    CONSTRAINT stop_visit_departure CHECK ((departed_at IS NULL) = (departed_by IS NULL)),
    CONSTRAINT stop_visit_order CHECK (departed_at IS NULL OR departed_at >= arrived_at)
);

-- One outcome per order. Units are counted per order (no product catalog exists).
CREATE TABLE delivery_record (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_trip_id bigint NOT NULL REFERENCES delivery_trip(id),
    order_id bigint NOT NULL UNIQUE REFERENCES customer_order(id),
    outlet_id varchar(8) NOT NULL REFERENCES outlet(outlet_id),
    outcome varchar(16) NOT NULL CHECK (outcome IN ('DELIVERED', 'PARTIAL', 'FAILED')),
    ordered_units integer NOT NULL CHECK (ordered_units > 0),
    -- What left the depot: fewer than ordered when the loader sent the order short.
    loaded_units integer NOT NULL CHECK (loaded_units >= 0 AND loaded_units <= ordered_units),
    delivered_units integer NOT NULL CHECK (delivered_units >= 0 AND delivered_units <= loaded_units),
    issue_kind varchar(24) CHECK (issue_kind IN ('CUSTOMER_UNAVAILABLE', 'MISSING', 'DAMAGED', 'WRONG_ITEM', 'REFUSED', 'OTHER')),
    recipient_name varchar(120),
    notes varchar(500),
    recorded_by bigint NOT NULL REFERENCES app_user(id),
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL,
    CONSTRAINT delivery_record_outcome_units CHECK (
        (outcome = 'DELIVERED' AND delivered_units = loaded_units AND issue_kind IS NULL)
        OR (outcome = 'PARTIAL' AND delivered_units > 0 AND delivered_units < loaded_units AND issue_kind IS NOT NULL)
        OR (outcome = 'FAILED' AND delivered_units = 0 AND issue_kind IS NOT NULL)),
    CONSTRAINT delivery_record_recipient CHECK (outcome = 'FAILED' OR (recipient_name IS NOT NULL AND length(trim(recipient_name)) > 0))
);
CREATE INDEX ix_delivery_record_trip ON delivery_record(delivery_trip_id);

-- Proof photos and signatures. Uploaded first, then attached to the order's record.
CREATE TABLE pod_asset (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_trip_id bigint NOT NULL REFERENCES delivery_trip(id),
    order_id bigint NOT NULL REFERENCES customer_order(id),
    delivery_record_id bigint REFERENCES delivery_record(id),
    kind varchar(16) NOT NULL CHECK (kind IN ('PHOTO', 'SIGNATURE')),
    storage varchar(16) NOT NULL,
    object_key varchar(256) NOT NULL UNIQUE,
    content_type varchar(32) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    bytes integer NOT NULL CHECK (bytes > 0),
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    uploaded_by bigint NOT NULL REFERENCES app_user(id),
    uploaded_at timestamptz NOT NULL
);
CREATE INDEX ix_pod_asset_order ON pod_asset(order_id);
CREATE INDEX ix_pod_asset_record ON pod_asset(delivery_record_id);
