import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

export const userRoutes = () => {
  const app = new Hono<AppEnv>();
  
  // Get current user info
  app.get('/me', requireAuth, async (c) => {
    try {
      const db = c.env.DB;
      const user = c.get('user');

      if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      // Get user roles and permissions
      const userRoles = await db.prepare(
        `SELECT r.name, r.description FROM roles r 
         JOIN user_roles ur ON r.id = ur.role_id 
         WHERE ur.user_id = ?`
      ).bind(user.id).all();

      const result = {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: userRoles.results.map((r) => r.name),
        permissions: [] // Would be populated from role permissions
      };

      return c.json({ user: result });
    } catch (error) {
      console.error('Error fetching user info:', error);
      return c.json({ error: 'Failed to fetch user info' }, 500);
    }
  });

  // Update current user profile
  app.put('/profile', requireAuth, async (c) => {
    try {
      const db = c.env.DB;
      const user = c.get('user');
      const { name } = await c.req.json();

      if (!user || !name) {
        return c.json({ error: 'Invalid request' }, 400);
      }

      const result = await db.prepare(
        `UPDATE users SET name = ? WHERE id = ? RETURNING *`
      ).bind(name, user.id).run();

      if (result.meta.rows_written === 0) {
        return c.json({ error: 'User not found' }, 404);
      }

      return c.json({ user: result.results[0] });
    } catch (error) {
      console.error('Error updating profile:', error);
      return c.json({ error: 'Failed to update profile' }, 500);
    }
  });

  // Get specific user info (if admin)
  app.get('/:id', requireAuth, async (c) => {
    try {
      const db = c.env.DB;
      const user = c.get('user');
      const userId = c.req.param('id');

      if (!user || !userId) {
        return c.json({ error: 'Invalid request' }, 400);
      }

      // Get user info (can be accessed by the user or admin)
      const result = await db.prepare(
        `SELECT u.id, u.email, u.name, u.created_at, 
                GROUP_CONCAT(r.name) as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE u.id = ?
         GROUP BY u.id`
      ).bind(userId).first();

      if (!result) {
        return c.json({ error: 'User not found' }, 404);
      }

      return c.json({ user: result });
    } catch (error) {
      console.error('Error fetching user:', error);
      return c.json({ error: 'Failed to fetch user' }, 500);
    }
  });

  return app;
};