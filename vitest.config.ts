import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

// Mirrors esbuild's `with { type: 'text' }` handling so template scripts load as strings under Vite.
const textScripts = {
  name: 'template-scripts-as-text',
  enforce: 'pre' as const,
  load(id: string) {
    const file = id.split('?')[0].replace(/\\/g, '/');
    if (file.includes('/src/templates/js/') && file.endsWith('.js')) {
      return `export default ${JSON.stringify(readFileSync(file, 'utf8'))};`;
    }
  },
};

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      textScripts,
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
      // Better Auth surfaces expected 3xx redirects and 4xx APIErrors as rejected promises inside workerd even
      // though the HTTP response is correct; ignore only those, never other unhandled errors.
      onUnhandledError: (error) => {
        const status = (error as { statusCode?: number }).statusCode;
        if (error.name === 'APIError' && typeof status === 'number' && status >= 300 && status < 500) {
          return false;
        }
      },
      setupFiles: ['./test/apply-migrations.ts'],
      include: ['test/**/*.test.ts'],
    },
  };
});
