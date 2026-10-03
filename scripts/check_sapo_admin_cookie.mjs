#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const cookieFile = process.env.SAPO_COOKIE_FILE || '/home/node/.openclaw/credentials/sapo-bachngan.cookies';
const base = (process.env.SAPO_ADMIN_BASE || 'https://bachngankiengiang.mysapogo.com/admin').replace(/\/$/, '');
const origin = base.replace(/\/admin$/, '');

function parseNetscapeCookieJar(text) {
  return text.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const [domain, includeSubdomains, path, secure, expires, name, ...valueParts] = line.split('\t');
    return {
      domain,
      includeSubdomains: includeSubdomains === 'TRUE',
      path,
      secure: secure === 'TRUE',
      expires: Number(expires) || 0,
      name,
      value: valueParts.join('\t'),
    };
  }).filter(cookie => cookie.domain && cookie.name);
}

function domainMatches(cookieDomain, hostname) {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase();
  return hostname === domain || hostname.endsWith('.' + domain);
}

function cookieHeaderFor(url, cookies) {
  const target = new URL(url);
  const now = Math.floor(Date.now() / 1000);
  return cookies
    .filter(cookie => domainMatches(cookie.domain, target.hostname))
    .filter(cookie => !cookie.expires || cookie.expires > now)
    .filter(cookie => target.pathname.startsWith(cookie.path || '/'))
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function expiresAt(cookies, name) {
  const values = cookies.filter(cookie => cookie.name === name && cookie.expires);
  if (!values.length) return null;
  return new Date(Math.max(...values.map(cookie => cookie.expires)) * 1000).toISOString();
}

const cookies = parseNetscapeCookieJar(readFileSync(cookieFile, 'utf8'));
const cookieHeader = cookieHeaderFor(base + '/accounts.json', cookies);

if (!cookieHeader.includes('_admin_session_id=')) {
  console.log(JSON.stringify({
    ok: false,
    status: 'missing_admin_session',
    message: 'Cookie jar thiếu _admin_session_id.',
    adminSessionExpiresAt: expiresAt(cookies, '_admin_session_id'),
    cookieNames: cookies.map(cookie => cookie.name).sort(),
  }));
  process.exit(2);
}

const response = await fetch(base + '/accounts.json', {
  headers: {
    cookie: cookieHeader,
    accept: 'application/json,text/plain,*/*',
    'content-type': 'application/json; charset=UTF-8',
    'x-sapo-client': 'sapo-frontend-v3',
    'x-sapo-serviceid': 'sapo-frontend-v3',
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OpenClaw-Sapo-Direct',
    origin,
    referer: base,
    'accept-language': 'vi',
  },
});

const text = await response.text();
let body;
try {
  body = text ? JSON.parse(text) : {};
} catch {
  body = text;
}

const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
const loginResponse = typeof body === 'string' && /login|unauthorized|forbidden/i.test(bodyText.slice(0, 500));
const ok = response.ok && !loginResponse;

console.log(JSON.stringify({
  ok,
  status: ok ? 'alive' : 'sapo_session_invalid',
  httpStatus: response.status,
  accountCount: Array.isArray(body?.accounts) ? body.accounts.length : undefined,
  adminSessionExpiresAt: expiresAt(cookies, '_admin_session_id'),
  cookieNames: cookies.map(cookie => cookie.name).sort(),
  message: ok ? 'Sapo admin session is alive.' : `Sapo admin rejected session (${response.status}).`,
}));

process.exit(ok ? 0 : 3);
