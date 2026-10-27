import type { AuthEnv, AuthSession, AuthUser } from './auth';

export interface Authz {
  role: string | null;
  permissions: string[];
}

export type AppEnv = {
  Bindings: AuthEnv;
  Variables: {
    user: AuthUser;
    session: AuthSession;
    authz: Authz;
  };
};
