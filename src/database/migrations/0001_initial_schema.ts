// This file contains the initial schema for Better Auth with D1
// Note: Better Auth handles most of the tables, but we'll add our custom tables

export const up = `
  -- Custom roles table (managed by our system)
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Custom user roles assignment table
  CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
  );

  -- Custom permissions table
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Role permissions assignment table
  CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
  );

  -- Create indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
`;

export const down = `
  DROP TABLE IF EXISTS role_permissions;
  DROP TABLE IF EXISTS permissions;
  DROP TABLE IF EXISTS user_roles;
  DROP TABLE IF EXISTS roles;
`;