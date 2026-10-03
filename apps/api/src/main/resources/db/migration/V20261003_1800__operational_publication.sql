-- Operational publication: plan versions that supersede each other, a frozen published schedule,
-- the driver linked to each vehicle, and load tasks for the loader. Additive except for widening
-- the plan status check to allow 'superseded'.

ALTER TABLE plan DROP CONSTRAINT plan_status_check;
ALTER TABLE plan ADD CONSTRAINT plan_status_check CHECK (status IN ('candidate', 'published', 'superseded'));
-- The published plan a candidate revises (NULL for the first version of a run).
ALTER TABLE plan ADD COLUMN based_on_plan_id bigint REFERENCES plan(id);
ALTER TABLE plan ADD COLUMN superseded_by_plan_id bigint REFERENCES plan(id);
ALTER TABLE plan ADD COLUMN superseded_at timestamptz;
ALTER TABLE plan ADD CONSTRAINT plan_superseded_pair
    CHECK ((status = 'superseded') = (superseded_by_plan_id IS NOT NULL AND superseded_at IS NOT NULL));

-- Values as computed and validated at publication; NULL while a plan is a candidate.
ALTER TABLE trip ADD COLUMN planned_depart time;
ALTER TABLE trip ADD COLUMN trip_minutes integer CHECK (trip_minutes >= 0);
ALTER TABLE trip ADD COLUMN distance_km numeric(8,2) CHECK (distance_km >= 0);
ALTER TABLE trip ADD COLUMN fuel_litres numeric(8,2) CHECK (fuel_litres >= 0);
ALTER TABLE trip ADD COLUMN driver_user_id bigint REFERENCES app_user(id);
ALTER TABLE trip ADD COLUMN driver_name varchar(120);
ALTER TABLE stop ADD COLUMN planned_arrival time;
ALTER TABLE stop ADD COLUMN service_start time;

-- Each vehicle has a driver (booklet); a driver account is linked to at most one vehicle.
ALTER TABLE app_user ADD COLUMN vehicle_id varchar(8) REFERENCES vehicle(vehicle_id);
ALTER TABLE app_user ADD CONSTRAINT app_user_vehicle_driver_only CHECK (vehicle_id IS NULL OR role = 'DRIVER');
CREATE UNIQUE INDEX ux_app_user_driver_vehicle ON app_user(vehicle_id) WHERE vehicle_id IS NOT NULL AND active;

-- One load task per published trip. Lines are loaded in reverse stop order (last stop loads first).
CREATE TABLE load_task (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id bigint NOT NULL REFERENCES plan(id),
    plan_version integer NOT NULL CHECK (plan_version > 0),
    trip_id bigint NOT NULL UNIQUE REFERENCES trip(id),
    plan_date date NOT NULL REFERENCES calendar_day(date),
    depot varchar(32) NOT NULL,
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    trip_index smallint NOT NULL CHECK (trip_index IN (1, 2)),
    brand varchar(16) NOT NULL,
    district varchar(32) NOT NULL,
    planned_depart time NOT NULL,
    driver_user_id bigint REFERENCES app_user(id),
    status varchar(16) NOT NULL CHECK (status IN ('pending', 'loading', 'loaded', 'superseded')),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX ix_load_task_run ON load_task(plan_date, depot, status);
CREATE INDEX ix_load_task_plan ON load_task(plan_id);

CREATE TABLE load_line (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    load_task_id bigint NOT NULL REFERENCES load_task(id),
    order_id bigint NOT NULL REFERENCES customer_order(id),
    -- Copies taken at publication, so the manifest never changes under the loader.
    order_ref varchar(16) NOT NULL,
    outlet_id varchar(8) NOT NULL,
    temp_requirement varchar(16) NOT NULL,
    units integer NOT NULL CHECK (units > 0),
    weight_kg numeric(10,2) NOT NULL CHECK (weight_kg > 0),
    volume_m3 numeric(10,3) NOT NULL CHECK (volume_m3 > 0),
    stop_seq integer NOT NULL CHECK (stop_seq > 0),
    load_seq integer NOT NULL CHECK (load_seq > 0),
    status varchar(16) NOT NULL CHECK (status IN ('pending', 'loaded', 'short', 'damaged', 'missing')),
    UNIQUE (load_task_id, order_id),
    UNIQUE (load_task_id, stop_seq),
    UNIQUE (load_task_id, load_seq)
);
