import { Hono } from 'hono';
import { createAuth } from './auth';
import { adminRoutes } from './api/admin';
import { loadAuthz, requireAuth, requireRole } from './middleware/auth';
import { render, scripts, styles, templates } from './templates';
import { isTrustedRedirect, parseOrigins } from './origins';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; " +
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

// Public keys are safe to cache; this lets browsers, the edge and consumer Workers skip refetching them.
app.use('/api/auth/jwks', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && c.res.status === 200) {
    c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  }
});

app.on(['GET', 'POST', 'PUT', 'DELETE'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

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

// HTML and CSS live in src/templates and are bundled into the Worker, so they are only reachable through these routes.
app.get('/css/login.css', (c) => c.body(styles.login, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));

app.get('/js/login.js', (c) => c.body(scripts.login, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));
app.get('/js/dashboard.js', (c) => c.body(scripts.dashboard, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }));

app.get('/', (c) => {
  const buttons: string[] = [];
  if (c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) buttons.push(templates.socialGoogle.trim());

  const requested = c.req.query('redirect') ?? '';
  const redirect = isTrustedRedirect(requested, c.env.PUBLIC_URL, parseOrigins(c.env.TRUSTED_ORIGINS)) ? requested : '/dashboard';

  const content =
    buttons.length > 0
      ? render(templates.loginProviders, { BUTTONS: buttons.join('\n        '), REDIRECT: redirect })
      : templates.loginNone;
  return c.html(render(templates.login, { CONTENT: content }));
});

app.get('/login', (c) => c.redirect('/'));

app.get('/dashboard', requireAuth, async (c) => {
  const user = c.get('user');
  const authz = await loadAuthz(c.env.DB, user.id);
  const items = authz.permissions.map((name) => render(templates.permissionItem, { NAME: name }).trim());
  return c.html(
    render(templates.dashboard, {
      EMAIL: user.email,
      ROLE: authz.role ?? 'none',
      PERMISSIONS: items.length > 0 ? `<ul>${items.join('')}</ul>` : '<p>none</p>',
    }),
  );
});

app.get('/admin', requireAuth, requireRole('admin'), (c) => c.html(templates.admin));

app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error('Unhandled error', err.name);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
