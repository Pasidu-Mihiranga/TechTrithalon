-- Phase 5: immutable planning input snapshots for a date+depot planning attempt.
CREATE TABLE planning_snapshot (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_date         date NOT NULL REFERENCES calendar_day(date),
    depot             varchar(20) NOT NULL,
    taken_at          timestamptz NOT NULL,
    order_ids         bigint[] NOT NULL,
    fleet_json        jsonb NOT NULL,
    constraints_json  jsonb NOT NULL,
    reference_version varchar(64) NOT NULL,
    content_hash      varchar(64) NOT NULL,
    taken_by          bigint REFERENCES app_user(id)
);

CREATE INDEX ix_snapshot_date_depot ON planning_snapshot(plan_date, depot, taken_at DESC);
