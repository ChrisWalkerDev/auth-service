// @ts-expect-error Provided by the Cloudflare Workers test runtime.
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: never[] }).TEST_MIGRATIONS);
