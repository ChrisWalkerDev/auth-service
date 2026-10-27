import { Hono } from 'hono';
import { betterAuth } from 'better-auth';
import { D1Database } from '@cloudflare/workers-types';

// Authentication middleware that validates sessions
export const requireAuth = async (c: Hono.Context, next: () => Promise<void>) => {
  try {
    // Get the session from the request header
    const authHeader = c.req.header('authorization') || c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({ error: 'No authorization header provided' }, 401);
    }

    // Extract token (should be Bearer <token>)
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    // Validate session using Better Auth
    // Note: This is a simplified approach - in practice, you'd integrate with Better Auth's session management properly
    const user = await validateSession(token);
    
    if (!user) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Add user to context for use in routes
    c.set('user', user);
    
    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

// Simple session validation function - in practice, Better Auth would handle this properly
const validateSession = async (token: string): Promise<any | null> => {
  // This would normally use Better Auth's session validation
  // For now we return a mock user for demonstration
  return {
    id: 'mock-user-id',
    email: 'user@example.com',
    name: 'Test User'
  };
};

// Role-based authorization middleware
export const requireRole = (...roles: string[]) => {
  return async (c: Hono.Context, next: () => Promise<void>) => {
    try {
      const user = c.get('user');
      
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      // Check if user has at least one of the required roles
      const hasRole = roles.some(role => {
        // In a real implementation, this would check against database roles
        // For now, we'll simulate role checking
        return true; // Simplified for demonstration
      });

      if (!hasRole) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

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

      // Check if user has at least one of the required permissions
      const hasPermission = permissions.some(permission => {
        // In a real implementation, this would check against database permissions
        // For now, we'll simulate permission checking
        return true; // Simplified for demonstration
      });

      if (!hasPermission) {
        return c.json({ error: 'Insufficient permissions' }, 403);
      }

      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({ error: 'Authorization failed' }, 403);
    }
  };
};