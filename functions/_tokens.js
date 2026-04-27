// Token lifecycle helpers used by V2 to enforce expiry and to regenerate
// team / scorer tokens. The token_expires_at + token_policy columns come
// from migration 0009; both helpers default to "never expired" when those
// columns are missing so legacy events keep working unchanged.

export function isEventTokenExpired(eventRow) {
  if (!eventRow) return false;
  const exp = eventRow.token_expires_at;
  if (!exp) return false;
  // D1 returns text; both 'YYYY-MM-DD HH:MM:SS' and ISO 'YYYY-MM-DDTHH:…Z'
  // can appear depending on whether SQLite or our JS layer wrote it.
  const iso = exp.includes('T') ? exp : exp.replace(' ', 'T') + 'Z';
  const expMs = Date.parse(iso);
  if (Number.isNaN(expMs)) return false;
  return Date.now() > expMs;
}

// Returns a small object suitable for embedding in API responses so the
// client can render token-state UI without a second fetch.
export function tokenStateSnapshot(eventRow) {
  return {
    token_policy: eventRow?.token_policy || 'never',
    token_expires_at: eventRow?.token_expires_at || null,
    token_expired: isEventTokenExpired(eventRow),
  };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function newToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
