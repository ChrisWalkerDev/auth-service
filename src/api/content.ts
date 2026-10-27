// Content routes removed as requested - keeping only user and role management
import { Hono } from 'hono';

export const contentRoutes = () => {
  const app = new Hono();
  
  // Placeholder for future content routes if needed
  app.get('/', (c) => {
    return c.json({ message: 'Content routes placeholder' });
  });

  return app;
};