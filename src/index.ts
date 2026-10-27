import { Hono } from 'hono';
import { createAuth } from './auth';
import { adminRoutes } from './api/admin';
import { loadAuthz, requireAuth, requireRole } from './middleware/auth';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; " +
  "form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

app.use('*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', CSP);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

// CSRF defence for our own state-changing routes (Better Auth checks Origin itself).
app.use('/api/*', async (c, next) => {
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !c.req.path.startsWith('/api/auth/')) {
    if (c.req.header('Origin') !== new URL(c.env.PUBLIC_URL).origin) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }
  await next();
});

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

app.get('/api/me', requireAuth, async (c) => {
  const user = c.get('user');
  const authz = await loadAuthz(c.env.DB, user.id);
  return c.json({
    user: { id: user.id, name: user.name, email: user.email },
    role: authz.role,
    permissions: authz.permissions,
  });
});

app.route('/api/admin', adminRoutes());

// Minimal server-checked page shells; pages themselves hold no data.
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;

app.get('/', (c) =>
  c.html(page('Auth Service', '<h1>Auth Service</h1><a href="/login">Log in</a> · <a href="/register">Register</a>')),
);
app.get('/login', (c) => c.html(page('Log in', '<h1>Log in</h1><p>POST /api/auth/sign-in/email</p>')));
app.get('/register', (c) =>
  c.env.DISABLE_SIGNUP === 'true'
    ? c.notFound()
    : c.html(page('Register', '<h1>Register</h1><p>POST /api/auth/sign-up/email</p>')),
);
app.get('/dashboard', requireAuth, (c) =>
  c.html(page('Dashboard', `<h1>Dashboard</h1><p>Signed in as ${escapeHtml(c.get('user').email)}</p>`)),
);
app.get('/admin', requireAuth, requireRole('admin'), (c) => c.html(page('Admin', '<h1>Admin</h1>')));

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Unhandled error', err.name);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
