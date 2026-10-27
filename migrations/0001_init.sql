-- Better Auth core tables (default camelCase schema, SQLite/D1)
CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account" ("userId");

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Better Auth rate limiter storage (used when rateLimit.storage = "database")
CREATE TABLE "rateLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" INTEGER NOT NULL
);

-- Authorization schema
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- One role per user (primary key on user_id)
CREATE TABLE user_roles (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles (id),
  assigned_by TEXT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

INSERT INTO roles (id, description) VALUES
  ('admin', 'Full administrative access'),
  ('member', 'Standard member');

INSERT INTO permissions (id, description) VALUES
  ('users:read', 'List and view users'),
  ('users:manage', 'Delete users'),
  ('roles:manage', 'Assign roles to users');

INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('admin', 'users:read'),
  ('admin', 'users:manage'),
  ('admin', 'roles:manage');
