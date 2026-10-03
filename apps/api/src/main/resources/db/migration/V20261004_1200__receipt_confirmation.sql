-- Store receipt: the store manager confirms what arrived or disputes it, once per delivered order.
-- A dispute opens a discrepancy for the dispatcher. Additive only.

CREATE TABLE receipt_confirmation (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint NOT NULL UNIQUE REFERENCES customer_order(id),
    delivery_record_id bigint NOT NULL UNIQUE REFERENCES delivery_record(id),
    outlet_id varchar(8) NOT NULL REFERENCES outlet(outlet_id),
    outcome varchar(12) NOT NULL CHECK (outcome IN ('CONFIRMED', 'DISPUTED')),
    -- Units the driver handed over (what the store checks against).
    delivered_units integer NOT NULL CHECK (delivered_units > 0),
    kind varchar(16) CHECK (kind IN ('SHORT', 'DAMAGED', 'WRONG_ITEM', 'OTHER')),
    affected_units integer CHECK (affected_units >= 1 AND affected_units <= delivered_units),
    note varchar(500),
    confirmed_by bigint NOT NULL REFERENCES app_user(id),
    confirmed_by_name varchar(120) NOT NULL,
    confirmed_at timestamptz NOT NULL,
    CONSTRAINT receipt_dispute_fields CHECK (
        (outcome = 'CONFIRMED' AND kind IS NULL AND affected_units IS NULL)
        OR (outcome = 'DISPUTED' AND kind IS NOT NULL AND affected_units IS NOT NULL
            AND (kind <> 'OTHER' OR length(trim(coalesce(note, ''))) > 0)))
);

CREATE TABLE receipt_discrepancy (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id bigint NOT NULL UNIQUE REFERENCES receipt_confirmation(id),
    order_id bigint NOT NULL REFERENCES customer_order(id),
    order_ref varchar(16) NOT NULL,
    outlet_id varchar(8) NOT NULL REFERENCES outlet(outlet_id),
    depot varchar(32) NOT NULL,
    delivered_units integer NOT NULL,
    kind varchar(16) NOT NULL,
    affected_units integer NOT NULL,
    note varchar(500),
    vehicle_id varchar(8),
    driver_name varchar(120),
    delivered_at timestamptz,
    reported_by bigint NOT NULL REFERENCES app_user(id),
    reported_by_name varchar(120) NOT NULL,
    reported_at timestamptz NOT NULL,
    status varchar(10) NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
    decision varchar(12) CHECK (decision IN ('CREDIT', 'REPLACEMENT', 'NO_ACTION')),
    decision_note varchar(500),
    resolved_by bigint REFERENCES app_user(id),
    resolved_by_name varchar(120),
    resolved_at timestamptz,
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT receipt_discrepancy_resolution CHECK (
        (status = 'RESOLVED') = (decision IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
            AND length(trim(coalesce(decision_note, ''))) > 0))
);
CREATE INDEX ix_receipt_discrepancy_outlet ON receipt_discrepancy(outlet_id, status);
CREATE INDEX ix_receipt_discrepancy_depot ON receipt_discrepancy(depot, status);
