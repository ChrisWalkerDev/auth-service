import type { D1Database } from '@cloudflare/workers-types';
import type { AuthSession, AuthUser } from './auth';

export type AppEnv = {
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    user: AuthUser;
    session: AuthSession;
  };
};
