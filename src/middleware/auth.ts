import { Hono } from 'hono';
import { auth } from '../index';

// Authentication middleware that validates sessions using Better Auth
export const requireAuth = async (c: Hono.Context, next: () => Promise<void>) => {
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

// Role-based authorization middleware
export const requireRole = (...roles: string[]) => {
  return async (c: Hono.Context, next: () => Promise<void>) => {
    try {
      const user = c.get('user');
      
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // In a real implementation, this would check against database roles
      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({ error: 'Authorization failed' }, 403);
    }
  };
};

// Permission-based authorization middleware
export const requirePermission = (...permissions: string[]) => {
  return async (c: Hono.Context, next: () => Promise<void>) => {
    try {
      const user = c.get('user');
      
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // In a real implementation, this would check against database permissions
      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({ error: 'Authorization failed' }, 403);
    }
  };
};