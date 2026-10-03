// Membership must be loaded from the database, never from a browser payload.
export function canViewQuotation(viewer, creator) {
  if (!viewer?.active || !creator) return false;
  return viewer.role === 'manager' || viewer.id === creator.id ||
    (Boolean(viewer.positionId) && viewer.positionId === creator.positionId);
}

export function canEditQuotation(viewer, creator) {
  return Boolean(viewer?.active && creator && (viewer.role === 'manager' || viewer.id === creator.id ||
    (Boolean(viewer.positionId) && viewer.positionId === creator.positionId)));
}

// Use this predicate for both the list and individual records, including exports.
export function quoteShareKeys(overrides, viewer) {
  const positionId = viewer?.positionId;
  if (!positionId || !overrides) return [];
  const pairs = Array.isArray(overrides)
    ? overrides
    : String(overrides).split(/[\n;,]+/).map(item => {
      const [quoteKey, ...positions] = item.split(':');
      return {quoteKey: quoteKey?.trim(), positions: positions.join(':').split('|').map(value => value.trim()).filter(Boolean)};
    });
  return [...new Set(pairs
    .filter(item => item?.quoteKey && Array.isArray(item.positions) && item.positions.includes(positionId))
    .map(item => item.quoteKey))];
}

export function quoteOverrideKeys(overrides) {
  return new Set(String(overrides || '').split(/[\n;,]+/).map(value => value.trim()).filter(Boolean));
}

export function quoteKeyOverridden(overrides, ...keys) {
  const configured = quoteOverrideKeys(overrides);
  return keys.some(key => configured.has(String(key || '').trim()));
}

export function quotationScope(viewer, sharedQuoteKeys = []) {
  if (!viewer?.active) return { sql: '0 = 1', bindings: [] };
  if (viewer.role === 'manager') return { sql: '1 = 1', bindings: [] };
  const sharedKeys = [...new Set((sharedQuoteKeys || []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 50);
  const sharedSql = sharedKeys.length ? ` OR q.quote_no IN (${sharedKeys.map(() => '?').join(',')}) OR q.id IN (${sharedKeys.map(() => '?').join(',')})` : '';
  return {
    sql: `(q.creator_id = ? OR (m.position_id IS NOT NULL AND m.position_id = ?)${sharedSql})`,
    bindings: [viewer.id, viewer.positionId ?? null, ...sharedKeys, ...sharedKeys],
  };
}
