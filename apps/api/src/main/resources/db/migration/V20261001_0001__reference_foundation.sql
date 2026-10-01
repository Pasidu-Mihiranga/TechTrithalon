CREATE TABLE district_travel (
    district varchar(32) PRIMARY KEY,
    depot varchar(20) NOT NULL,
    road_class varchar(20) NOT NULL,
    free_flow_kmh numeric(7,2) NOT NULL,
    depot_to_district_km numeric(8,2) NOT NULL,
    depot_to_district_min integer NOT NULL,
    inter_stop_km numeric(8,2) NOT NULL,
    inter_stop_min integer NOT NULL
);

CREATE TABLE outlet (
    outlet_id varchar(8) PRIMARY KEY,
    brand varchar(12) NOT NULL,
    district varchar(32) NOT NULL REFERENCES district_travel(district),
    depot varchar(20) NOT NULL,
    dock_type varchar(20) NOT NULL,
    parking_constraint varchar(20) NOT NULL,
    mall_window_open time,
    mall_window_close time,
    window_open time NOT NULL,
    window_close time NOT NULL,
    CONSTRAINT mall_window_pair CHECK ((mall_window_open IS NULL) = (mall_window_close IS NULL))
);
CREATE INDEX ix_outlet_depot_district_brand ON outlet(depot, district, brand);

CREATE TABLE vehicle (
    vehicle_id varchar(8) PRIMARY KEY,
    type varchar(10) NOT NULL,
    temp varchar(10) NOT NULL,
    weight_cap_kg numeric(10,2) NOT NULL,
    volume_cap_m3 numeric(10,3) NOT NULL,
    fuel_type varchar(16) NOT NULL,
    km_per_l numeric(8,2) NOT NULL,
    weekly_fuel_quota_l numeric(10,2) NOT NULL,
    depot varchar(20) NOT NULL
);
CREATE INDEX ix_vehicle_depot_temp_type ON vehicle(depot, temp, type);

CREATE TABLE calendar_day (
    date date PRIMARY KEY,
    dow smallint NOT NULL,
    dow_name varchar(3) NOT NULL,
    is_weekend boolean NOT NULL,
    iso_year smallint NOT NULL,
    iso_week smallint NOT NULL,
    is_payday boolean NOT NULL,
    festival varchar(40),
    festival_ramp numeric(4,3) NOT NULL,
    is_holiday boolean NOT NULL,
    monsoon boolean NOT NULL,
    is_operating boolean NOT NULL
);
CREATE INDEX ix_calendar_iso_week ON calendar_day(iso_year, iso_week);

CREATE TABLE service_allowance (
    brand varchar(12) NOT NULL,
    dock_type varchar(20) NOT NULL,
    minutes integer NOT NULL,
    PRIMARY KEY (brand, dock_type)
);
