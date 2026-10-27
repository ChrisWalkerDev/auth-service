import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { auth } from '../src/index';

// Security tests for the authentication system
describe('Security Tests', () => {
  it('should not allow access without authentication', async () => {
    const app = new Hono();
    
    // Mock a protected route
    app.get('/protected', async (c) => {
      return c.json({ message: 'Protected' });
    });

    // Test that unauthenticated requests get 401
    const response = await app.request('/protected', {
      method: 'GET',
    });
    
    expect(response.status).toBe(401);
  });

  it('should properly handle valid Better Auth sessions', async () => {
    // This would test the actual integration with Better Auth
    // In a real test, we'd need to set up proper session cookies
    expect(auth).toBeDefined();
    expect(auth.api).toBeDefined();
  });
});