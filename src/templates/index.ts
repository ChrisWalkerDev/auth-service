import loginPage from './login.html';
import dashboardPage from './dashboard.html';
import adminPage from './admin.html';
import loginProviders from './partials/login-providers.html';
import loginNone from './partials/login-none.html';
import socialGoogle from './partials/social-google.html';
import permissionItem from './partials/permission-item.html';
import loginCss from './css/login.css';

import loginJs from './js/login.js' with { type: 'text' };
import dashboardJs from './js/dashboard.js' with { type: 'text' };

export const styles = { login: loginCss };
export const scripts = { login: loginJs, dashboard: dashboardJs };

export const templates = {
  login: loginPage,
  dashboard: dashboardPage,
  admin: adminPage,
  loginProviders,
  loginNone,
  socialGoogle,
  permissionItem,
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

// {{KEY}} is HTML-escaped; {{{KEY}}} is inserted raw and must only receive trusted markup.
// Single pass, so substituted values are never re-scanned for placeholders.
export function render(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_m, raw: string | undefined, esc: string | undefined) =>
    raw !== undefined ? (vars[raw] ?? '') : escapeHtml(vars[esc as string] ?? ''),
  );
}
