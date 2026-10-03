-- Loader workflow: per-order loading counts, shortfall issues, vehicle holds, manifest acknowledgement
-- and handover. Additive only.

ALTER TABLE load_task
    -- Copied at publication so the manifest is self-contained (the loader cannot read fleet data).
    ADD COLUMN driver_name varchar(120),
    ADD COLUMN weight_cap_kg numeric(10,2) CHECK (weight_cap_kg > 0),
    ADD COLUMN volume_cap_m3 numeric(10,3) CHECK (volume_cap_m3 > 0),
    -- The task of the replaced version for the same vehicle and trip slot; a new manifest must be acknowledged.
    ADD COLUMN replaces_task_id bigint REFERENCES load_task(id),
    ADD COLUMN acknowledgement_required boolean NOT NULL DEFAULT false,
    ADD COLUMN acknowledged_by bigint REFERENCES app_user(id),
    ADD COLUMN acknowledged_at timestamptz,
    ADD COLUMN started_by bigint REFERENCES app_user(id),
    ADD COLUMN started_at timestamptz,
    -- Trip loaded and handed over to the driver.
    ADD COLUMN loaded_by bigint REFERENCES app_user(id),
    ADD COLUMN loaded_at timestamptz,
    ADD CONSTRAINT load_task_acknowledged_pair CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL)),
    ADD CONSTRAINT load_task_loaded_pair CHECK ((status = 'loaded') = (loaded_at IS NOT NULL) OR status = 'superseded');

ALTER TABLE load_line
    -- Units actually loaded. NULL while pending; equal to units when loaded; fewer when short.
    ADD COLUMN loaded_units integer CHECK (loaded_units >= 0),
    ADD COLUMN checked_by bigint REFERENCES app_user(id),
    ADD COLUMN checked_at timestamptz,
    -- Set when a republished manifest keeps an order on the same vehicle and trip: the count carries over.
    ADD COLUMN carried_from_line_id bigint REFERENCES load_line(id),
    ADD CONSTRAINT load_line_loaded_units_max CHECK (loaded_units IS NULL OR loaded_units <= units),
    ADD CONSTRAINT load_line_count_matches_status CHECK (
        (status = 'pending' AND loaded_units IS NULL)
        OR (status = 'loaded' AND loaded_units = units)
        OR (status IN ('short', 'damaged', 'missing') AND loaded_units < units));

-- A shortfall reported before departure. Open issues that hold the vehicle block handover until
-- the dispatcher decides.
CREATE TABLE loading_issue (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    load_task_id bigint NOT NULL REFERENCES load_task(id),
    load_line_id bigint NOT NULL REFERENCES load_line(id),
    order_id bigint NOT NULL REFERENCES customer_order(id),
    order_ref varchar(16) NOT NULL,
    outlet_id varchar(8) NOT NULL,
    plan_date date NOT NULL REFERENCES calendar_day(date),
    depot varchar(32) NOT NULL,
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    trip_index smallint NOT NULL CHECK (trip_index IN (1, 2)),
    kind varchar(16) NOT NULL CHECK (kind IN ('MISSING', 'DAMAGED', 'WRONG_ITEM')),
    ordered_units integer NOT NULL CHECK (ordered_units > 0),
    short_units integer NOT NULL CHECK (short_units > 0),
    note varchar(500),
    holds_vehicle boolean NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
    reported_by bigint NOT NULL REFERENCES app_user(id),
    reported_by_name varchar(120) NOT NULL,
    reported_at timestamptz NOT NULL,
    decision varchar(16) CHECK (decision IN ('SEND_SHORT', 'REPLANNED')),
    decision_note varchar(500),
    resolved_by bigint REFERENCES app_user(id),
    resolved_by_name varchar(120),
    resolved_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CHECK (short_units <= ordered_units),
    CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL AND decision IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE INDEX ix_loading_issue_run ON loading_issue(plan_date, depot, status);
CREATE INDEX ix_loading_issue_task ON loading_issue(load_task_id);
-- One open issue per order line; a republished manifest moves the issue to the carried line.
CREATE UNIQUE INDEX ux_loading_issue_open_line ON loading_issue(load_line_id) WHERE status = 'OPEN';
