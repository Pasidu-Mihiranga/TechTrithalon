-- New snapshots freeze the complete input payload. Legacy rows remain readable and
-- must be recreated rather than pretending that their missing inputs were frozen.
ALTER TABLE planning_snapshot ADD COLUMN inputs_json jsonb;
ALTER TABLE planning_snapshot ADD COLUMN selection_mode varchar(16) NOT NULL DEFAULT 'all'
    CHECK (selection_mode IN ('all', 'selected'));

CREATE FUNCTION prevent_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Planning snapshots are immutable';
END;
$$;
CREATE TRIGGER planning_snapshot_immutable BEFORE UPDATE ON planning_snapshot
    FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

-- Enforce the existing ordering rule even when two confirmations race.
CREATE UNIQUE INDEX ux_order_active_temperature
    ON customer_order(outlet_id, order_date, temp_requirement)
    WHERE status <> 'cancelled';
