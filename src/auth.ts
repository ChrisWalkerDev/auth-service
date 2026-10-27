import { betterAuth } from 'better-auth';
import { jwt } from 'better-auth/plugins';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  PUBLIC_URL: string;
  DISABLE_SIGNUP?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
}

// Better Auth is stateless apart from D1, so a lightweight instance is created per request
// because Workers bindings are only available at request time.
export const createAuth = (env: AuthEnv) => {
  const secure = env.PUBLIC_URL.startsWith('https://');
  const bootstrapEmail = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();

  return betterAuth({
    database: env.DB,
    baseURL: env.PUBLIC_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL],
    plugins: [
      // Short-lived JWTs for third-party services; this Worker itself still authenticates via cookie.
      jwt({
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
        jwt: {
          issuer: env.PUBLIC_URL,
          audience: env.PUBLIC_URL,
          expirationTime: '15m',
          definePayload: ({ user }) => ({ email: user.email, name: user.name }),
        },
      }),
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: env.DISABLE_SIGNUP === 'true',
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every new user gets the member role; the bootstrap email becomes admin only
          // while no admin exists. Done in one atomic statement.
          after: async (user) => {
            await env.DB.prepare(
              `INSERT OR IGNORE INTO user_roles (user_id, role_id)
               VALUES (?1, CASE WHEN ?2 <> '' AND lower(?3) = ?2
                 AND NOT EXISTS (SELECT 1 FROM user_roles WHERE role_id = 'admin')
                 THEN 'admin' ELSE 'member' END)`,
            )
              .bind(user.id, bootstrapEmail, user.email)
              .run();
          },
        },
      },
    },
  });
};

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session']['session'];
export type AuthUser = Auth['$Infer']['Session']['user'];
