import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { createUserSession, e, ORIGIN, unconfigured } from './helpers';

let ipCounter = 0;
const call = (
  path: string,
  init: RequestInit & { cookie?: string; origin?: string | null; env?: typeof e } = {},
) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  headers.set('CF-Connecting-IP', `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, init.env ?? e);
};

describe('authentication', () => {
  it('reads /api/me with a session, logs out and loses access', async () => {
    const u = await createUserSession();

    const me = await call('/api/me', { cookie: u.cookie });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { email: string }; role: string; permissions: string[] };
    expect(body.user.email).toBe(u.email);
    expect(body.role).toBe('member');
    expect(body.permissions).toEqual([]);

    const out = await call('/api/auth/sign-out', { method: 'POST', cookie: u.cookie, body: '{}' });
    expect(out.status).toBe(200);
    expect((await call('/api/me', { cookie: u.cookie })).status).toBe(401);
  });

  it('has email/password sign-in and sign-up disabled', async () => {
    const up = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'x@example.com', password: 'correct horse battery staple', name: 'X' }),
    });
    expect(up.status).toBeGreaterThanOrEqual(400);
    const inn = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'x@example.com', password: 'correct horse battery staple' }),
    });
    expect(inn.status).toBeGreaterThanOrEqual(400);
    const row = await e.DB.prepare('SELECT id FROM "user" WHERE email = ?').bind('x@example.com').first();
    expect(row).toBeNull();
  });
});

describe('unauthenticated and forged credentials', () => {
  const protectedPaths = ['/api/me', '/api/admin/users', '/dashboard', '/admin'];
  it.each(protectedPaths)('401 without credentials: %s', async (p) => {
    expect((await call(p)).status).toBe(401);
  });

  it('rejects fabricated bearer tokens and cookies', async () => {
    const r1 = await call('/api/me', { headers: { Authorization: 'Bearer ' + 'forged.token.value' } });
    expect(r1.status).toBe(401);
    const r2 = await call('/api/me', { cookie: 'better-auth.session_token=forged.value' });
    expect(r2.status).toBe(401);
  });

  it('rejects identity headers supplied by the client', async () => {
    const res = await call('/api/me', { headers: { 'X-User-Id': 'x', 'X-User-Role': 'admin' } });
    expect(res.status).toBe(401);
  });

  it('rejects expired and revoked sessions', async () => {
    const u = await createUserSession();
    await e.DB.prepare('UPDATE session SET expiresAt = ? WHERE userId = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), u.id)
      .run();
    expect((await call('/api/me', { cookie: u.cookie })).status).toBe(401);

    const v = await createUserSession();
    expect((await call('/api/me', { cookie: v.cookie })).status).toBe(200);
    await e.DB.prepare('DELETE FROM session WHERE userId = ?').bind(v.id).run();
    expect((await call('/api/me', { cookie: v.cookie })).status).toBe(401);
  });
});

describe('authorization', () => {
  it('members cannot use admin APIs or pages', async () => {
    const m = await createUserSession();
    expect((await call('/api/admin/users', { cookie: m.cookie })).status).toBe(403);
    expect((await call('/admin', { cookie: m.cookie })).status).toBe(403);
    expect((await call('/dashboard', { cookie: m.cookie })).status).toBe(200);
  });

  it('members cannot escalate themselves or others', async () => {
    const m = await createUserSession();
    const other = await createUserSession();
    const self = await call(`/api/admin/users/${m.id}/role`, {
      method: 'PUT',
      cookie: m.cookie,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(self.status).toBe(403);
    const oth = await call(`/api/admin/users/${other.id}/role`, {
      method: 'PUT',
      cookie: m.cookie,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(oth.status).toBe(403);
    const row = await e.DB.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').bind(m.id).first();
    expect(row?.role_id).toBe('member');
  });

  it('bootstrap email becomes the first admin, who can manage roles', async () => {
    const admin = await createUserSession('boss@example.com');
    const me = (await (await call('/api/me', { cookie: admin.cookie })).json()) as {
      role: string;
      permissions: string[];
    };
    expect(me.role).toBe('admin');
    expect(me.permissions).toEqual(expect.arrayContaining(['users:read', 'users:manage', 'roles:manage']));
    expect((await call('/admin', { cookie: admin.cookie })).status).toBe(200);

    const target = await createUserSession();
    const list = await call('/api/admin/users', { cookie: admin.cookie });
    expect(list.status).toBe(200);

    const promote = await call(`/api/admin/users/${target.id}/role`, {
      method: 'PUT',
      cookie: admin.cookie,
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(promote.status).toBe(200);
    const row = await e.DB.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').bind(target.id).first();
    expect(row?.role_id).toBe('admin');

    expect(
      (await call(`/api/admin/users/${admin.id}/role`, {
        method: 'PUT',
        cookie: admin.cookie,
        body: JSON.stringify({ role: 'member' }),
      })).status,
    ).toBe(403);
    expect(
      (await call(`/api/admin/users/${target.id}/role`, {
        method: 'PUT',
        cookie: admin.cookie,
        body: JSON.stringify({ role: 'superuser' }),
      })).status,
    ).toBe(400);
    expect(
      (await call('/api/admin/users/nonexistent/role', {
        method: 'PUT',
        cookie: admin.cookie,
        body: JSON.stringify({ role: 'member' }),
      })).status,
    ).toBe(404);
  });
});

describe('CSRF', () => {
  it('rejects state-changing admin requests with a foreign or missing Origin', async () => {
    const admin = await createUserSession();
    await e.DB.prepare("UPDATE user_roles SET role_id='admin' WHERE user_id=?").bind(admin.id).run();
    for (const origin of ['https://evil.example', null]) {
      const res = await call('/api/admin/users/someone/role', {
        method: 'PUT',
        cookie: admin.cookie,
        origin,
        body: JSON.stringify({ role: 'admin' }),
      });
      expect(res.status).toBe(403);
    }
  });
});

describe('headers', () => {
  it('sends security headers and no-store', async () => {
    const res = await call('/');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(res.headers.get('Content-Security-Policy')).toContain("style-src 'self'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('pages and assets', () => {
  const providers = {
    ...unconfigured,
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsecret',
    TRUSTED_ORIGINS: 'https://chriswalker.dev,https://*.chriswalker.dev',
  };

  it('serves the login page at / with only configured providers', async () => {
    const none = await call('/', { env: unconfigured });
    expect(none.status).toBe(200);
    expect(none.headers.get('content-type')).toContain('text/html');
    expect(await none.text()).toContain('No social providers configured');

    const html = await (await call('/', { env: providers })).text();
    expect(html).toContain('data-provider="google"');
    expect(html).not.toContain('data-provider="github"');
    expect(html).toContain('/css/login.css');
    expect(html).toContain('/js/login.js');
  });

  it('redirects /login to /', async () => {
    const res = await call('/login', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('has no register page', async () => {
    expect((await call('/register')).status).toBe(404);
  });

  it('serves the stylesheet and scripts', async () => {
    const css = await call('/css/login.css');
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await css.text()).toContain('.social-button');
    for (const p of ['/js/login.js', '/js/dashboard.js']) {
      const js = await call(p);
      expect(js.status).toBe(200);
      expect(js.headers.get('content-type')).toContain('javascript');
    }
  });

  it('only passes trusted redirect targets to the login buttons', async () => {
    const target = async (redirect: string) => {
      const html = await (await call(`/?redirect=${encodeURIComponent(redirect)}`, { env: providers })).text();
      return /data-redirect="([^"]*)"/.exec(html)?.[1];
    };
    expect(await target('https://blog.chriswalker.dev/yay/test?a=1')).toBe('https://blog.chriswalker.dev/yay/test?a=1');
    expect(await target('/dashboard')).toBe('/dashboard');
    expect(await target('https://evil.example/steal')).toBe('/dashboard');
    expect(await target('https://chriswalker.dev.evil.example')).toBe('/dashboard');
  });

  it('escapes values in the dashboard and shows role and permissions', async () => {
    const admin = await createUserSession();
    await e.DB.prepare("UPDATE user_roles SET role_id='admin' WHERE user_id=?").bind(admin.id).run();
    const html = await (await call('/dashboard', { cookie: admin.cookie })).text();
    expect(html).toContain(`Signed in as ${admin.email}`);
    expect(html).toContain('<li>users:read</li>');
    expect(html).toContain('id="logout"');

    const evil = await createUserSession('"><script>x</script>@example.com');
    const evilHtml = await (await call('/dashboard', { cookie: evil.cookie })).text();
    expect(evilHtml).not.toContain('<script>x</script>');
    expect(evilHtml).toContain('&lt;script&gt;');
  });
});
