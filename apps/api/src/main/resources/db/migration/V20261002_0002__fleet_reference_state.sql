CREATE TABLE vehicle_availability (
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    date date NOT NULL REFERENCES calendar_day(date),
    status varchar(16) NOT NULL CHECK (status IN ('available','in_workshop')),
    note text NOT NULL,
    version bigint NOT NULL CHECK (version > 0),
    updated_by bigint NOT NULL REFERENCES app_user(id),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY(vehicle_id,date)
);
CREATE TABLE fuel_ledger (
    vehicle_id varchar(8) NOT NULL REFERENCES vehicle(vehicle_id),
    iso_year smallint NOT NULL,
    iso_week smallint NOT NULL CHECK (iso_week BETWEEN 1 AND 53),
    litres_committed numeric(10,2) NOT NULL DEFAULT 0 CHECK (litres_committed >= 0),
    litres_actual numeric(10,2) NOT NULL DEFAULT 0 CHECK (litres_actual >= 0),
    PRIMARY KEY(vehicle_id,iso_year,iso_week)
);
CREATE TABLE audit_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type varchar(64) NOT NULL,
    actor_id bigint REFERENCES app_user(id),
    entity_type varchar(24) NOT NULL,
    entity_id varchar(32) NOT NULL,
    before_json jsonb,
    after_json jsonb,
    reason text,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL
);
CREATE INDEX ix_audit_entity ON audit_event(entity_type,entity_id,occurred_at DESC);
