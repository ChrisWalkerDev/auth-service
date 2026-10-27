import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            BETTER_AUTH_SECRET: 'test-only-secret-test-only-secret-0123456789',
            PUBLIC_URL: 'http://localhost:8787',
            BOOTSTRAP_ADMIN_EMAIL: 'boss@example.com',
          },
        },
      }),
    ],
    test: {
      // Better Auth surfaces expected 4xx APIErrors as rejected promises inside workerd even though
      // the HTTP response is correct; ignore only those, never other unhandled errors.
      onUnhandledError: (error) => {
        const status = (error as { statusCode?: number }).statusCode;
        if (error.name === 'APIError' && typeof status === 'number' && status >= 400 && status < 500) {
          return false;
        }
      },
      setupFiles: ['./test/apply-migrations.ts'],
      include: ['test/**/*.test.ts'],
    },
  };
});
