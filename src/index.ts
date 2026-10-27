import { Hono } from 'hono';
import { betterAuth } from 'better-auth';
import { requireAuth } from './middleware/auth';

// Create the main Hono app
const app = new Hono();

// Configure Better Auth with Cloudflare D1
export const auth = betterAuth({
  database: {
    provider: 'sqlite',
    // This will be set to the D1 binding in Cloudflare Workers
  },
  // Session configuration for secure cookies
  session: {
    cookie: {
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
    },
    expiration: {
      // 24 hours
      session: 24 * 60 * 60,
    },
  },
  // User registration settings
  user: {
    enableRegistration: true,
    requireEmailVerification: false,
  },
  // Configure email/password authentication
  emailAndPassword: {
    enabled: true,
  },
});

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

// Simple test endpoint
app.get('/test', (c) => {
  return c.json({ message: 'Service is running correctly' });
});

export default app;
export type AppType = typeof app;