-- Durable deferral history, carry-forward to a later planning run, and store notices.
-- Additive only: no existing column is dropped, renamed or retyped.

-- The run an order is planned in. Equals the requested delivery date (order_date)
-- until a published deferral moves the order to a later operating day.
ALTER TABLE customer_order ADD COLUMN planning_date date REFERENCES calendar_day(date);
UPDATE customer_order SET planning_date = order_date;
ALTER TABLE customer_order ALTER COLUMN planning_date SET NOT NULL;
CREATE FUNCTION default_order_planning_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.planning_date IS NULL THEN NEW.planning_date := NEW.order_date; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER customer_order_planning_date BEFORE INSERT ON customer_order
    FOR EACH ROW EXECUTE FUNCTION default_order_planning_date();
CREATE INDEX ix_order_run ON customer_order(planning_date, depot, status);

-- Fairness facts supplied with imported orders (task2b scenarios). NULL for store-placed orders.
ALTER TABLE customer_order ADD COLUMN source_deferred_yesterday boolean;
ALTER TABLE customer_order ADD COLUMN source_days_since_served smallint CHECK (source_days_since_served >= 0);

-- Candidate-level deferral decision, kept until publication turns it into history.
ALTER TABLE plan_order_disposition
    ADD COLUMN reason_code varchar(24) CHECK (reason_code IN
        ('CAPACITY','NO_REEFER','WINDOW_CONFLICT','VAN_ACCESS','OTHER')),
    ADD COLUMN protect_next_run boolean NOT NULL DEFAULT true,
    ADD COLUMN notify_store boolean NOT NULL DEFAULT true,
    ADD COLUMN decided_by bigint REFERENCES app_user(id),
    ADD COLUMN decided_by_name varchar(120),
    ADD COLUMN decided_at timestamptz;

-- Append-only history. "Deferred yesterday" and consecutive skips are derived from it.
CREATE TABLE deferral (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES customer_order(id),
    -- Immutable copies taken at decision time, so history reads need no other module's tables.
    order_ref varchar(16) NOT NULL,
    brand varchar(12) NOT NULL,
    temp_requirement varchar(16) NOT NULL,
    outlet_id varchar(8) NOT NULL REFERENCES outlet(outlet_id),
    plan_id bigint NOT NULL REFERENCES plan(id),
    plan_date date NOT NULL REFERENCES calendar_day(date),
    next_planning_date date NOT NULL REFERENCES calendar_day(date) CHECK (next_planning_date > plan_date),
    depot varchar(32) NOT NULL,
    reason_code varchar(24) NOT NULL CHECK (reason_code IN
        ('CAPACITY','NO_REEFER','WINDOW_CONFLICT','VAN_ACCESS','OTHER')),
    rule_code varchar(48),
    reason varchar(500) NOT NULL CHECK (length(trim(reason)) > 0),
    protect_next_run boolean NOT NULL,
    notify_store boolean NOT NULL,
    consecutive_deferrals integer NOT NULL CHECK (consecutive_deferrals > 0),
    evidence_json jsonb NOT NULL,
    decided_by bigint NOT NULL REFERENCES app_user(id),
    decided_by_name varchar(120) NOT NULL,
    decided_at timestamptz NOT NULL,
    recorded_by bigint NOT NULL REFERENCES app_user(id),
    recorded_at timestamptz NOT NULL,
    UNIQUE (plan_id, order_id)
);
CREATE INDEX ix_deferral_order ON deferral(order_id, plan_date DESC);
CREATE INDEX ix_deferral_outlet ON deferral(outlet_id, plan_date DESC);
CREATE INDEX ix_deferral_run ON deferral(plan_date, depot);
CREATE INDEX ix_deferral_next_run ON deferral(next_planning_date, depot);

CREATE FUNCTION prevent_deferral_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Deferral history is append-only';
END;
$$;
CREATE TRIGGER deferral_append_only BEFORE UPDATE OR DELETE ON deferral
    FOR EACH ROW EXECUTE FUNCTION prevent_deferral_change();

-- Store acknowledgement of a deferral notice; one per notice, also append-only.
CREATE TABLE deferral_acknowledgement (
    deferral_id bigint PRIMARY KEY REFERENCES deferral(id),
    acknowledged_by bigint NOT NULL REFERENCES app_user(id),
    acknowledged_at timestamptz NOT NULL
);
CREATE TRIGGER deferral_acknowledgement_append_only BEFORE UPDATE OR DELETE ON deferral_acknowledgement
    FOR EACH ROW EXECUTE FUNCTION prevent_deferral_change();
