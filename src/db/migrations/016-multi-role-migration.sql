-- 1. Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- 2. Populate roles table
INSERT OR IGNORE INTO roles (name) VALUES ('Superadmin'), ('Administrator'), ('FinanceManager'), ('SessionSupervisor');

-- 3. Create user_roles join table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 4. Migrate existing data from old role column to new multi-role system
-- Only run if old role column exists (for existing databases)

-- Check if we need to migrate existing users
-- First, try to migrate any existing users if they have roles but no user_roles entries
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'superadmin' AND r.name = 'Superadmin'
AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id);

-- Migrate any other admin users that might exist
INSERT OR IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username LIKE '%admin%' AND r.name = 'Administrator'
AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id);