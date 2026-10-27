import type { MiddlewareHandler } from 'hono';
import { createAuth } from '../auth';
import type { AppEnv, Authz } from '../types';

const json = (error: string) => ({ error });

// Validates the Better Auth session cookie server-side. Any failure denies access.
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  let session: Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>;
  try {
    session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  } catch {
    return c.json(json('Unauthorized'), 401);
  }
  if (!session) return c.json(json('Unauthorized'), 401);

  c.set('user', session.user);
  c.set('session', session.session);
  await next();
};

// Role and permissions always come from D1, keyed by the verified session user id.
export const loadAuthz = async (db: D1Database, userId: string): Promise<Authz> => {
  const [roleRow, permRows] = await db.batch([
    db.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').bind(userId),
    db
      .prepare(
        `SELECT rp.permission_id FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`,
      )
      .bind(userId),
  ]);
  const role = (roleRow.results[0] as { role_id: string } | undefined)?.role_id ?? null;
  const permissions = (permRows.results as { permission_id: string }[]).map((r) => r.permission_id);
  return { role, permissions };
};

const ensureAuthz: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('authz')) c.set('authz', await loadAuthz(c.env.DB, c.get('user').id));
  await next();
};

export const requireRole = (role: string): MiddlewareHandler<AppEnv> => async (c, next) => {
  let denied = false;
  await ensureAuthz(c, async () => {
    denied = c.get('authz').role !== role;
  });
  if (denied) return c.json(json('Forbidden'), 403);
  await next();
};

export const requirePermission = (permission: string): MiddlewareHandler<AppEnv> => async (c, next) => {
  let denied = false;
  await ensureAuthz(c, async () => {
    denied = !c.get('authz').permissions.includes(permission);
  });
  if (denied) return c.json(json('Forbidden'), 403);
  await next();
};
