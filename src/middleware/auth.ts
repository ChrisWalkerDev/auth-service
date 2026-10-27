import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth';
import type { AppEnv } from '../types';

// Authentication middleware that validates sessions using Better Auth
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  try {
    // Use Better Auth's built-in session validation
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    
    if (!session || !session.user) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Add user to context for use in routes
    c.set('user', session.user);
    c.set('session', session);
    
    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

// Role-based authorization middleware - now properly validates against database roles
export const requireRole = (...roles: string[]) => {
  const middleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    try {
      const user = c.get('user');
      
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // Get database connection
      const db = c.env.DB;
      
      // Check if user has at least one of the required roles by querying the database
      const userRoles = await db.prepare(
        `SELECT r.name FROM roles r 
         JOIN user_roles ur ON r.id = ur.role_id 
         WHERE ur.user_id = ?`
      ).bind(user.id).all();
      
      // Extract role names from results
      const userRoleNames = userRoles.results.map((row) => row.name);
      
      // Check if user has any of the required roles
      const hasRequiredRole = roles.some(role => userRoleNames.includes(role));
      
      if (!hasRequiredRole) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({ error: 'Authorization failed' }, 403);
    }
  };
  return middleware;
};

// Permission-based authorization middleware - now properly validates against database permissions
export const requirePermission = (...permissions: string[]) => {
  const middleware: MiddlewareHandler<AppEnv> = async (c, next) => {
    try {
      const user = c.get('user');
      
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // Get database connection
      const db = c.env.DB;
      
      // Check if user has at least one of the required permissions by querying the database
      const userPermissions = await db.prepare(
        `SELECT p.name FROM permissions p 
         JOIN role_permissions rp ON p.id = rp.permission_id
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`
      ).bind(user.id).all();
      
      // Extract permission names from results
      const userPermissionNames = userPermissions.results.map((row) => row.name);
      
      // Check if user has at least one of the required permissions
      const hasRequiredPermission = permissions.some(permission => userPermissionNames.includes(permission));
      
      if (!hasRequiredPermission) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({ error: 'Authorization failed' }, 403);
    }
  };
  return middleware;
};