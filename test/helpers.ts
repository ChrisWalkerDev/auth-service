import { env } from 'cloudflare:workers';
import { createAuth, type AuthEnv } from '../src/auth';

export const e = env as unknown as AuthEnv;
export const ORIGIN = 'http://localhost:8787';

// The Worker env may carry real provider secrets from .dev.vars; tests must not depend on them.
export const unconfigured: AuthEnv = {
  ...e,
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GITHUB_CLIENT_ID: undefined,
  GITHUB_CLIENT_SECRET: undefined,
  TRUSTED_ORIGINS: '',
};

const signCookie = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`);
};

let counter = 0;

// Email/password is disabled, so tests create users and sessions through Better Auth's internal adapter,
// mirroring what a completed social login produces (including the role-assignment hook).
export const createUserSession = async (email = `user${++counter}@example.com`) => {
  const ctx = await createAuth(e).$context;
  const user = await ctx.internalAdapter.createUser({ email, name: 'Test', emailVerified: true });
  const session = await ctx.internalAdapter.createSession(user.id);
  const cookie = `better-auth.session_token=${await signCookie(session.token, e.BETTER_AUTH_SECRET)}`;
  return { id: user.id, email, cookie };
};
