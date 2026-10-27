import { env } from 'cloudflare:workers';
import { describe, it, expect } from 'vitest';
import { createLocalJWKSet, jwtVerify, SignJWT, generateKeyPair } from 'jose';
import app from '../src/index';
import type { AuthEnv } from '../src/auth';

const e = env as unknown as AuthEnv;
const ORIGIN = 'http://localhost:8787';
let n = 0;
const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', init.cookie);
  headers.set('Origin', ORIGIN);
  headers.set('CF-Connecting-IP', `10.9.${Math.floor(++n / 250)}.${n % 250}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, e);
};

const signUp = async () => {
  const res = await call('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email: `jwt${++n}@example.com`, password: 'correct horse battery staple', name: 'J' }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie, id: ((await res.json()) as { user: { id: string } }).user.id };
};

describe('JWT plugin', () => {
  it('refuses to issue a token without a session', async () => {
    expect((await call('/api/auth/token')).status).toBe(401);
  });

  it('issues a verifiable, short-lived JWT for the session user', async () => {
    const u = await signUp();
    const res = await call('/api/auth/token', { cookie: u.cookie });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };

    const jwks = await call('/api/auth/jwks');
    expect(jwks.status).toBe(200);
    const set = createLocalJWKSet(await jwks.json());
    const { payload } = await jwtVerify(token, set, { issuer: ORIGIN, audience: ORIGIN });
    expect(payload.sub).toBe(u.id);
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(15 * 60);
    expect(JSON.stringify(await (await call('/api/auth/jwks')).json())).not.toContain('privateKey');
  });

  it('rejects JWTs signed with a different key', async () => {
    const u = await signUp();
    const { token } = (await (await call('/api/auth/token', { cookie: u.cookie })).json()) as { token: string };
    const set = createLocalJWKSet(await (await call('/api/auth/jwks')).json());
    const { privateKey } = await generateKeyPair('EdDSA');
    const forged = await new SignJWT({ sub: u.id })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer(ORIGIN)
      .setAudience(ORIGIN)
      .setExpirationTime('15m')
      .sign(privateKey);
    await expect(jwtVerify(forged, set, { issuer: ORIGIN, audience: ORIGIN })).rejects.toThrow();
    expect(token).toBeTruthy();
  });

  it('a JWT is not accepted as authentication by this Worker', async () => {
    const u = await signUp();
    const { token } = (await (await call('/api/auth/token', { cookie: u.cookie })).json()) as { token: string };
    const res = await call('/api/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(401);
  });
});
