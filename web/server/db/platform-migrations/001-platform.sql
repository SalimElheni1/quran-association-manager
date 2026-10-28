-- The platform: branches, platform administrators, web sessions, invitations, audit log.
-- Branch data itself lives in one schema per branch (branch_<id>), never here.

CREATE TABLE platform.admins (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX admins_email_key ON platform.admins (lower(email));

CREATE TABLE platform.branches (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 40),
  name TEXT NOT NULL,
  region TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_admin_id INTEGER REFERENCES platform.admins (id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
);

-- A session is stored by the SHA-256 of its cookie token; the token itself is never stored.
CREATE TABLE platform.sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('branch', 'platform')),
  branch_id INTEGER REFERENCES platform.branches (id) ON DELETE CASCADE,
  user_id INTEGER,
  admin_id INTEGER REFERENCES platform.admins (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT,
  user_agent TEXT,
  CHECK ((kind = 'branch' AND branch_id IS NOT NULL AND user_id IS NOT NULL)
      OR (kind = 'platform' AND admin_id IS NOT NULL))
);
CREATE INDEX sessions_branch_user ON platform.sessions (branch_id, user_id);
CREATE INDEX sessions_expires ON platform.sessions (expires_at);

CREATE TABLE platform.invitations (
  id SERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES platform.branches (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor')),
  email TEXT,
  name TEXT,
  created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('platform', 'branch')),
  created_by_admin_id INTEGER REFERENCES platform.admins (id) ON DELETE SET NULL,
  created_by_user_id INTEGER,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id INTEGER,
  revoked_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ
);
CREATE INDEX invitations_branch ON platform.invitations (branch_id, created_at DESC);

CREATE TABLE platform.audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('platform', 'branch', 'system', 'anonymous')),
  actor_id INTEGER,
  actor_name TEXT,
  branch_id INTEGER REFERENCES platform.branches (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT
);
CREATE INDEX audit_log_branch_at ON platform.audit_log (branch_id, at DESC);
CREATE INDEX audit_log_at ON platform.audit_log (at DESC);

-- The desktop handlers' electron-store values (backup status, logo cache...), per branch.
CREATE TABLE platform.branch_kv (
  branch_id INTEGER NOT NULL REFERENCES platform.branches (id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  PRIMARY KEY (branch_id, store, key)
);
