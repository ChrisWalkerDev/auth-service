import { env } from 'cloudflare:workers';
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import type { AuthEnv } from '../src/auth';

const base = env as unknown as AuthEnv;
const configured: AuthEnv = {
  ...base,
  GOOGLE_CLIENT_ID: 'test-google-id',
  GOOGLE_CLIENT_SECRET: 'test-google-secret',
  GITHUB_CLIENT_ID: 'test-github-id',
  GITHUB_CLIENT_SECRET: 'test-github-secret',
};
let n = 0;

const start = (e: AuthEnv, provider: string, origin = 'http://localhost:8787', callbackURL = '/dashboard', cookie?: string) =>
  app.request(
    '/api/auth/sign-in/social',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'CF-Connecting-IP': `10.8.0.${++n}`,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({ provider, callbackURL }),
    },
    e,
  );

const providers = [
  { name: 'google', host: 'https://accounts.google.com', id: 'test-google-id', secret: 'test-google-secret' },
  { name: 'github', host: 'https://github.com', id: 'test-github-id', secret: 'test-github-secret' },
];

describe.each(providers)('$name sign-in', ({ name, host, id, secret }) => {
  it('returns an authorization URL with state when configured', async () => {
    const res = await start(configured, name);
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const u = new URL(url);
    expect(u.origin).toBe(host);
    expect(u.searchParams.get('client_id')).toBe(id);
    expect(u.searchParams.get('redirect_uri')).toBe(`http://localhost:8787/api/auth/callback/${name}`);
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(u.searchParams.get('code_challenge')).toBeTruthy();
    expect(url).not.toContain(secret);
  });

  it('is unavailable when credentials are not configured', async () => {
    const res = await start(base, name);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects cookie-bearing start requests from a foreign origin', async () => {
    const res = await start(configured, name, 'https://evil.example', '/dashboard', 'better-auth.session_token=x.y');
    expect(res.status).toBe(403);
  });

  it('rejects an off-site callbackURL (open redirect)', async () => {
    const res = await start(configured, name, 'http://localhost:8787', 'https://evil.example/steal');
    expect(res.status).toBe(403);
  });

  it('rejects a callback with a forged state and creates no session', async () => {
    const res = await app.request(
      `/api/auth/callback/${name}?code=fake&state=forged`,
      { headers: { 'CF-Connecting-IP': `10.8.1.${++n}` }, redirect: 'manual' },
      configured,
    );
    const loc = res.headers.get('location') ?? '';
    expect(res.status === 302 ? loc : String(res.status)).toMatch(/error|4\d\d/);
    expect(res.headers.getSetCookie().join(';')).not.toContain('session_token');
  });
});

describe('providers are independent', () => {
  it('github works while google is unconfigured', async () => {
    const onlyGithub: AuthEnv = { ...base, GITHUB_CLIENT_ID: 'gh', GITHUB_CLIENT_SECRET: 'ghs' };
    expect((await start(onlyGithub, 'github')).status).toBe(200);
    expect((await start(onlyGithub, 'google')).status).toBeGreaterThanOrEqual(400);
  });
});
