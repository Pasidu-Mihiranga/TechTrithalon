-- Identity: users, their role scope, and server-side sessions.

CREATE TABLE app_user (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      varchar(64)  NOT NULL,
    display_name  varchar(120) NOT NULL,
    password_hash varchar(100) NOT NULL,
    role          varchar(20)  NOT NULL,
    -- Scope: a store manager belongs to one outlet; a loader to one depot.
    -- A dispatcher's depot is optional (NULL = both depots).
    outlet_id     varchar(8) REFERENCES outlet(outlet_id),
    depot         varchar(20),
    active        boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT app_user_role_valid CHECK (role IN ('DISPATCHER', 'STORE_MANAGER', 'LOADER', 'DRIVER')),
    CONSTRAINT app_user_store_manager_has_outlet CHECK ((role = 'STORE_MANAGER') = (outlet_id IS NOT NULL)),
    CONSTRAINT app_user_loader_has_depot CHECK (role <> 'LOADER' OR depot IS NOT NULL)
);
-- Usernames are case-insensitive.
CREATE UNIQUE INDEX ux_app_user_username ON app_user (lower(username));

-- The cookie holds a random token; only its SHA-256 hash is stored, so a database leak
-- does not leak usable sessions.
CREATE TABLE user_session (
    token_hash   char(64)    PRIMARY KEY,
    user_id      bigint      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    revoked_at   timestamptz
);
CREATE INDEX ix_user_session_user ON user_session (user_id);
CREATE INDEX ix_user_session_expiry ON user_session (expires_at);
