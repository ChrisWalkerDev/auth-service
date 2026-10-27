import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

const roleBody = z.object({ role: z.enum(['admin', 'member']) }).strict();
const idParam = z.string().min(1).max(128);

export const adminRoutes = () => {
  const app = new Hono<AppEnv>();
  app.use('*', requireAuth);

  app.get('/users', requirePermission('users:read'), async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.createdAt, ur.role_id AS role
       FROM "user" u LEFT JOIN user_roles ur ON ur.user_id = u.id
       ORDER BY u.createdAt DESC LIMIT 200`,
    ).all();
    return c.json({ users: results });
  });

  app.put('/users/:id/role', requirePermission('roles:manage'), async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Invalid user id' }, 400);

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const body = roleBody.safeParse(payload);
    if (!body.success) return c.json({ error: 'Invalid role' }, 400);

    const actor = c.get('user');
    if (id.data === actor.id) {
      return c.json({ error: 'You cannot change your own role' }, 403);
    }

    const exists = await c.env.DB.prepare('SELECT 1 FROM "user" WHERE id = ?').bind(id.data).first();
    if (!exists) return c.json({ error: 'User not found' }, 404);

    await c.env.DB.prepare(
      `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id) DO UPDATE SET role_id = excluded.role_id,
         assigned_by = excluded.assigned_by,
         assigned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(id.data, body.data.role, actor.id)
      .run();
    return c.json({ id: id.data, role: body.data.role });
  });

  app.delete('/users/:id', requirePermission('users:manage'), async (c) => {
    const id = idParam.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Invalid user id' }, 400);
    if (id.data === c.get('user').id) {
      return c.json({ error: 'You cannot delete your own account' }, 403);
    }
    const res = await c.env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(id.data).run();
    if (res.meta.changes === 0) return c.json({ error: 'User not found' }, 404);
    return c.body(null, 204);
  });

  return app;
};
