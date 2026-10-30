// Parses a comma-separated list such as "https://app.example.com, https://*.example.com".
export const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const WILDCARD = /^(https?):\/\/\*\.([a-z0-9.-]+)(:\d+)?$/i;

const originMatches = (url: URL, pattern: string): boolean => {
  const wild = WILDCARD.exec(pattern);
  if (wild) {
    const [, proto, domain, port] = wild;
    const portOk = (port ? port.slice(1) : '') === url.port;
    return url.protocol === `${proto.toLowerCase()}:` && portOk && url.hostname.endsWith(`.${domain.toLowerCase()}`);
  }
  try {
    return new URL(pattern).origin === url.origin;
  } catch {
    return false;
  }
};

// Accepts same-site relative paths, or absolute http(s) URLs whose origin is this service or an allowed origin.
export const isTrustedRedirect = (target: string, publicUrl: string, allowed: string[]): boolean => {
  if (target.startsWith('/')) return !target.startsWith('//') && !target.includes('\\');
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return false;
  if (url.username || url.password) return false;
  return [publicUrl, ...allowed].some((p) => originMatches(url, p));
};
