const PREFIX = 'bn-dashboard:v1:';
export const DASHBOARD_CACHE_MS = 120_000;

// Auth must be checked before calling this helper. Never share report data
// between accounts, roles, browser tabs or Vietnam calendar days.
export async function dashboardCached(storage, scope, path, load, {force = false, now = Date.now} = {}) {
  const key = PREFIX + JSON.stringify([scope, path]);
  if (!force) {
    try {
      const entry = JSON.parse(storage.getItem(key) || 'null');
      const age = entry ? now() - entry.at : -1;
      if (age >= 0 && age < DASHBOARD_CACHE_MS) return entry.data;
    } catch { /* Storage can be unavailable or contain invalid data. */ }
  }
  const data = await load();
  try { storage.setItem(key, JSON.stringify({at: now(), data})); } catch { /* Quota/privacy mode: use live data. */ }
  return data;
}

export function clearDashboardCache(storage) {
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) storage.removeItem(key);
    }
  } catch { /* Cache is optional. */ }
}
