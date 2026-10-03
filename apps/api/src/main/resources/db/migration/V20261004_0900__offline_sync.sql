-- Offline field work: every outbox action from a phone is stored once under the id the device gave it
-- (a UUIDv7), so a retried request never applies twice. Proof uploads get the same protection, and a
-- delivery the driver recorded against a plan that changed while offline is kept and flagged.
-- Additive only.

CREATE TABLE sync_command (
    client_action_id uuid PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES app_user(id),
    action_type varchar(24) NOT NULL CHECK (action_type IN ('TRIP_START', 'STOP_ARRIVE', 'ORDER_OUTCOME', 'STOP_DEPART', 'TRIP_COMPLETE')),
    plan_date date NOT NULL REFERENCES calendar_day(date),
    trip_index smallint NOT NULL CHECK (trip_index IN (1, 2)),
    entity_id varchar(32),
    plan_version integer CHECK (plan_version > 0),
    payload jsonb NOT NULL,
    -- Device time as reported, never rewritten; received_at is the server's.
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    result varchar(16) NOT NULL CHECK (result IN ('APPLIED', 'CONFLICT', 'REJECTED')),
    result_code varchar(48),
    result_detail jsonb,
    review_reason varchar(32),
    clock_skew boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_sync_command_user_time ON sync_command(user_id, occurred_at);
CREATE INDEX ix_sync_command_received ON sync_command(received_at);

ALTER TABLE pod_asset ADD COLUMN client_upload_id uuid;
CREATE UNIQUE INDEX ux_pod_asset_client_upload ON pod_asset(uploaded_by, client_upload_id) WHERE client_upload_id IS NOT NULL;

ALTER TABLE delivery_record ADD COLUMN review_reason varchar(32)
    CHECK (review_reason IN ('ORDER_NOT_ON_TRIP', 'PROOF_MISSING'));
