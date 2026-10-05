#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { checkSapoAdminHealth } from '../lib/sapo-admin.mjs';

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

const health = await checkSapoAdminHealth({
  SAPO_ADMIN_BASE: base,
  SAPO_ADMIN_COOKIE: cookieHeader,
});

console.log(JSON.stringify({
  ok: health.ok,
  status: health.ok ? 'alive' : 'sapo_session_invalid',
  code: health.code,
  httpStatus: health.details?.httpStatus || health.status || 200,
  accountCount: health.accountCount,
  adminSessionExpiresAt: expiresAt(cookies, '_admin_session_id'),
  cookieNames: cookies.map(cookie => cookie.name).sort(),
  message: health.message,
}));

process.exit(health.ok ? 0 : 3);
