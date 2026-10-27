import { Hono } from 'hono';
import { auth } from './auth';
import { requireAuth } from './middleware/auth';
import { adminRoutes } from './api/admin';
import type { AppEnv } from './types';

// Create the main Hono app
const app = new Hono<AppEnv>();

// Public route
app.get('/', (c) => {
  return c.json({ message: 'Welcome to the Auth Service' });
});

// Protected route using proper auth middleware
app.get('/protected', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ 
    message: 'This is a protected route',
    user: user
  });
});

// Add admin routes
app.route('/api/admin', adminRoutes());

// Simple test endpoint
app.get('/test', (c) => {
  return c.json({ message: 'Service is running correctly' });
});

export default app;
export type AppType = typeof app;