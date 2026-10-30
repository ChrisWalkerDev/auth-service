import { describe, expect, it } from 'vitest';
import { isTrustedRedirect, parseOrigins } from '../src/origins';

const PUBLIC = 'https://auth.chriswalker.dev';
const allowed = parseOrigins('https://chriswalker.dev, https://*.chriswalker.dev/');

describe('isTrustedRedirect', () => {
  it.each([
    '/dashboard',
    'https://auth.chriswalker.dev/x',
    'https://chriswalker.dev/app',
    'https://blog.chriswalker.dev/?a=1',
    'https://a.b.chriswalker.dev',
  ])('allows %s', (u) => expect(isTrustedRedirect(u, PUBLIC, allowed)).toBe(true));

  it.each([
    'https://evil.example/steal',
    'https://chriswalker.dev.evil.example',
    'https://evilchriswalker.dev',
    'http://blog.chriswalker.dev',
    'https://blog.chriswalker.dev:8443',
    'https://user:pw@blog.chriswalker.dev',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
  ])('rejects %s', (u) => expect(isTrustedRedirect(u, PUBLIC, allowed)).toBe(false));

  it('allows nothing extra when no origins are configured', () => {
    expect(isTrustedRedirect('https://chriswalker.dev', PUBLIC, [])).toBe(false);
  });
});
