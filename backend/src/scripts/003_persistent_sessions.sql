-- Additive migration.
-- Do not rerun schema.sql or seedDb.js.

CREATE TABLE IF NOT EXISTS login_session (
  session_id BIGSERIAL PRIMARY KEY,

  user_id INT NOT NULL
    REFERENCES users(user_id) ON DELETE CASCADE,

  token_hash CHAR(64) NOT NULL UNIQUE,

  token_version INT NOT NULL,

  role VARCHAR(20) NOT NULL
    CHECK (role IN ('admin', 'student', 'faculty')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS login_session_user
  ON login_session(user_id);