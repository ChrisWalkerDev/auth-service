import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth';
import { D1Database } from '@cloudflare/workers-types';

export const adminRoutes = () => {
  const app = new Hono();
  
  // Admin dashboard
  app.get('/dashboard', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      const user = c.get('user');

      // Get admin stats
      const totalUsers = await db.prepare(
        'SELECT COUNT(*) as count FROM users'
      ).first<{count: number}>();

      return c.json({
        message: 'Admin dashboard',
        user: user,
        stats: {
          totalUsers: totalUsers?.count || 0
        }
      });
    } catch (error) {
      console.error('Error in admin dashboard:', error);
      return c.json({ error: 'Failed to fetch admin data' }, 500);
    }
  });

  // Get all users (admin only)
  app.get('/users', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      
      const users = await db.prepare(
        `SELECT u.id, u.email, u.name, u.created_at, 
                GROUP_CONCAT(r.name) as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         GROUP BY u.id`
      ).all();

      return c.json({ users: users.results });
    } catch (error) {
      console.error('Error fetching users:', error);
      return c.json({ error: 'Failed to fetch users' }, 500);
    }
  });

  // Update user role
  app.put('/users/:id/role', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      const userId = c.req.param('id');
      const { roleId } = await c.req.json();

      // Validate input
      if (!userId || !roleId || isNaN(roleId)) {
        return c.json({ error: 'Invalid request - user ID and role ID required' }, 400);
      }

      // Check if user exists
      const userExists = await db.prepare(
        'SELECT id FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!userExists) {
        return c.json({ error: 'User not found' }, 404);
      }

      // Check if role exists
      const roleExists = await db.prepare(
        'SELECT id FROM roles WHERE id = ?'
      ).bind(roleId).first();

      if (!roleExists) {
        return c.json({ error: 'Role not found' }, 404);
      }

      // Assign role to user (replace existing roles)
      await db.prepare(
        `INSERT OR REPLACE INTO user_roles (user_id, role_id) VALUES (?, ?)`
      ).bind(userId, roleId).run();

      return c.json({ message: 'Role assigned successfully' });
    } catch (error) {
      console.error('Error assigning role:', error);
      return c.json({ error: 'Failed to assign role' }, 500);
    }
  });

  // Get roles
  app.get('/roles', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      
      const roles = await db.prepare(
        `SELECT r.*, COUNT(ur.user_id) as user_count 
         FROM roles r
         LEFT JOIN user_roles ur ON r.id = ur.role_id
         GROUP BY r.id`
      ).all();

      return c.json({ roles: roles.results });
    } catch (error) {
      console.error('Error fetching roles:', error);
      return c.json({ error: 'Failed to fetch roles' }, 500);
    }
  });

  // Create role
  app.post('/roles', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      const { name, description } = await c.req.json();

      // Validate input
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ error: 'Role name is required and must be a non-empty string' }, 400);
      }

      const result = await db.prepare(
        `INSERT INTO roles (name, description) VALUES (?, ?) RETURNING *`
      ).bind(name.trim(), description || '').run();

      return c.json({ role: result.results[0] });
    } catch (error) {
      console.error('Error creating role:', error);
      return c.json({ error: 'Failed to create role' }, 500);
    }
  });

  // Get permissions
  app.get('/permissions', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      
      const permissions = await db.prepare(
        'SELECT * FROM permissions'
      ).all();

      return c.json({ permissions: permissions.results });
    } catch (error) {
      console.error('Error fetching permissions:', error);
      return c.json({ error: 'Failed to fetch permissions' }, 500);
    }
  });

  // Assign permission to role
  app.post('/roles/:roleId/permissions', requireAuth, requireRole('admin'), async (c) => {
    try {
      const db = c.env.DB as D1Database;
      const roleId = parseInt(c.req.param('roleId'));
      const { permissionId } = await c.req.json();

      // Validate input
      if (isNaN(roleId) || !permissionId || isNaN(permissionId)) {
        return c.json({ error: 'Invalid request - role ID and permission ID required' }, 400);
      }

      // Check if role exists
      const roleExists = await db.prepare(
        'SELECT id FROM roles WHERE id = ?'
      ).bind(roleId).first();

      if (!roleExists) {
        return c.json({ error: 'Role not found' }, 404);
      }

      // Check if permission exists
      const permissionExists = await db.prepare(
        'SELECT id FROM permissions WHERE id = ?'
      ).bind(permissionId).first();

      if (!permissionExists) {
        return c.json({ error: 'Permission not found' }, 404);
      }

      // Assign permission to role
      await db.prepare(
        `INSERT OR REPLACE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`
      ).bind(roleId, permissionId).run();

      return c.json({ message: 'Permission assigned successfully' });
    } catch (error) {
      console.error('Error assigning permission:', error);
      return c.json({ error: 'Failed to assign permission' }, 500);
    }
  });

  return app;
};