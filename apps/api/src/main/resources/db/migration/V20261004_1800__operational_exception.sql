-- The dispatcher's exceptions queue is a read model over data other modules own (loading shortfalls,
-- receipt disputes, driver problems, offline review flags). This table holds only the dispatcher's own
-- handling state for an item: who took it and, for items with no workflow of their own, how it was closed.
-- Additive only.

CREATE TABLE operational_exception (
    id bigserial PRIMARY KEY,
    source_type varchar(24) NOT NULL CHECK (source_type IN ('LOADING_ISSUE', 'RECEIPT_DISCREPANCY', 'DELIVERY_PROBLEM', 'SYNC_REVIEW')),
    source_id varchar(40) NOT NULL,
    status varchar(12) NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
    claimed_by bigint REFERENCES app_user(id),
    claimed_by_name varchar(120),
    claimed_at timestamptz,
    resolved_by bigint REFERENCES app_user(id),
    resolved_by_name varchar(120),
    resolved_at timestamptz,
    note text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT ux_operational_exception_source UNIQUE (source_type, source_id),
    CONSTRAINT operational_exception_claimed CHECK (status = 'OPEN' OR claimed_by IS NOT NULL OR status = 'RESOLVED'),
    CONSTRAINT operational_exception_resolved CHECK (status <> 'RESOLVED'
        OR (resolved_by IS NOT NULL AND resolved_by_name IS NOT NULL AND resolved_at IS NOT NULL AND note IS NOT NULL AND btrim(note) <> ''))
);
