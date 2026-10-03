CREATE TABLE plan (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_id bigint NOT NULL REFERENCES planning_snapshot(id),
    plan_date date NOT NULL REFERENCES calendar_day(date),
    depot varchar(32) NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    status varchar(16) NOT NULL CHECK (status IN ('candidate','published')),
    lock_version integer NOT NULL DEFAULT 0 CHECK (lock_version >= 0),
    created_by bigint NOT NULL REFERENCES app_user(id),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    published_by bigint REFERENCES app_user(id),
    published_at timestamptz,
    UNIQUE (plan_date, depot, version)
);
CREATE UNIQUE INDEX ux_plan_published_single ON plan(plan_date,depot) WHERE status='published';
CREATE TABLE trip (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id bigint NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    trip_index smallint NOT NULL CHECK (trip_index IN (1,2)),
    brand varchar(16) NOT NULL,
    district varchar(32) NOT NULL,
    CONSTRAINT ux_manual_trip_slot UNIQUE (plan_id,vehicle_id,trip_index) DEFERRABLE INITIALLY IMMEDIATE,
    UNIQUE (id,plan_id)
);
CREATE TABLE stop (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id bigint NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    trip_id bigint NOT NULL,
    order_id bigint NOT NULL REFERENCES customer_order(id),
    seq integer NOT NULL CHECK (seq > 0),
    FOREIGN KEY (trip_id,plan_id) REFERENCES trip(id,plan_id) ON DELETE CASCADE,
    UNIQUE (plan_id,order_id),
    UNIQUE (trip_id,seq)
);
CREATE TABLE plan_order_disposition (
    plan_id bigint NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    order_id bigint NOT NULL REFERENCES customer_order(id),
    code varchar(16) NOT NULL CHECK (code IN ('UNASSIGNED','DEFERRED')),
    reason varchar(500) NOT NULL CHECK (length(trim(reason)) > 0),
    next_delivery_date date REFERENCES calendar_day(date),
    PRIMARY KEY (plan_id,order_id)
);
