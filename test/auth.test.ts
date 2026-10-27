import { env } from 'cloudflare:workers';
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import type { AuthEnv } from '../src/auth';

const e = env as unknown as AuthEnv;
const ORIGIN = 'http://localhost:8787';
const PASSWORD = 'correct horse battery staple';

let ipCounter = 0;
const call = (path: string, init: RequestInit & { cookie?: string; origin?: string | null; ip?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
  headers.set('CF-Connecting-IP', init.ip ?? `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, e);
};

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

let counter = 0;
const register = async (email = `user${++counter}@example.com`) => {
  const res = await call('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, name: 'Test' }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { email, id: body.user.id, cookie: cookieFrom(res) };
};

describe('authentication', () => {
  it('registers, reads /api/me, logs out and loses access', async () => {
    const u = await register();
    expect(u.cookie).toContain('session_token');

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

  it('logs in with valid credentials and rejects wrong passwords', async () => {
    const u = await register();
    const ok = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: u.email, password: PASSWORD }),
    });
    expect(ok.status).toBe(200);
    expect((await call('/api/me', { cookie: cookieFrom(ok) })).status).toBe(200);

    const bad = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: u.email, password: 'wrong-password-123' }),
    });
    expect(bad.status).toBe(401);
  });

  it('rejects weak passwords', async () => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'weak@example.com', password: 'short', name: 'W' }),
    });
    expect(res.status).toBe(400);
  });

  it('sets HttpOnly SameSite cookies', async () => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'cookie@example.com', password: PASSWORD, name: 'C' }),
    });
    const sc = res.headers.getSetCookie().join(';').toLowerCase();
    expect(sc).toContain('httponly');
    expect(sc).toContain('samesite=lax');
  });
});

describe('unauthenticated and forged credentials', () => {
  const protectedPaths = ['/api/me', '/api/admin/users', '/dashboard', '/admin'];
  it.each(protectedPaths)('401 without credentials: %s', async (p) => {
    expect((await call(p)).status).toBe(401);
  });

  it('rejects fabricated bearer tokens and cookies', async () => {
    const r1 = await call('/api/me', { headers: { Authorization: 'Bearer abc.def.ghi' } });
    expect(r1.status).toBe(401);
    const r2 = await call('/api/me', { cookie: 'better-auth.session_token=forged.value' });
    expect(r2.status).toBe(401);
  });

  it('rejects identity headers supplied by the client', async () => {
    const res = await call('/api/me', { headers: { 'X-User-Id': 'x', 'X-User-Role': 'admin' } });
    expect(res.status).toBe(401);
  });

  it('rejects expired and revoked sessions', async () => {
    const u = await register();
    await e.DB.prepare(`UPDATE session SET expiresAt = ? WHERE userId = ?`)
      .bind(new Date(Date.now() - 1000).toISOString(), u.id)
      .run();
    expect((await call('/api/me', { cookie: u.cookie })).status).toBe(401);

    const v = await register();
    expect((await call('/api/me', { cookie: v.cookie })).status).toBe(200);
    await e.DB.prepare('DELETE FROM session WHERE userId = ?').bind(v.id).run();
    expect((await call('/api/me', { cookie: v.cookie })).status).toBe(401);
  });
});

describe('authorization', () => {
  it('members cannot use admin APIs or pages', async () => {
    const m = await register();
    expect((await call('/api/admin/users', { cookie: m.cookie })).status).toBe(403);
    expect((await call('/admin', { cookie: m.cookie })).status).toBe(403);
    expect((await call('/dashboard', { cookie: m.cookie })).status).toBe(200);
  });

  it('members cannot escalate themselves or others', async () => {
    const m = await register();
    const other = await register();
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

  it('client-supplied role in sign-up body is ignored', async () => {
    const res = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'sneaky@example.com', password: PASSWORD, name: 'S', role: 'admin' }),
    });
    const body = (await res.json()) as { user: { id: string } };
    const row = await e.DB.prepare('SELECT role_id FROM user_roles WHERE user_id = ?').bind(body.user.id).first();
    expect(row?.role_id).toBe('member');
  });

  it('bootstrap email becomes the first admin, who can manage roles', async () => {
    const admin = await register('boss@example.com');
    const me = (await (await call('/api/me', { cookie: admin.cookie })).json()) as {
      role: string;
      permissions: string[];
    };
    expect(me.role).toBe('admin');
    expect(me.permissions).toEqual(expect.arrayContaining(['users:read', 'users:manage', 'roles:manage']));

    const target = await register();
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
    const admin = await register('boss2@example.com');
    await e.DB.prepare(`UPDATE user_roles SET role_id='admin' WHERE user_id=?`).bind(admin.id).run();
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
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
