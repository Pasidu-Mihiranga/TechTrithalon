-- Plan versioning details for operational publication. Additive only.

-- The rule set the published schedule was calculated and validated with (copied from the snapshot).
ALTER TABLE plan ADD COLUMN rule_version varchar(32);
UPDATE plan p SET rule_version = s.constraints_json->>'ruleVersion'
    FROM planning_snapshot s WHERE s.id = p.snapshot_id AND p.status <> 'candidate';
ALTER TABLE plan ADD CONSTRAINT plan_published_rule_version
    CHECK (status = 'candidate' OR rule_version IS NOT NULL);
CREATE INDEX ix_plan_based_on ON plan(based_on_plan_id) WHERE based_on_plan_id IS NOT NULL;

-- Driver work lists read trips by the driver they were published to.
CREATE INDEX ix_trip_driver ON trip(driver_user_id) WHERE driver_user_id IS NOT NULL;
