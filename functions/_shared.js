// Shared utilities for Pages Functions
// Cloudflare Pages Functions don't support npm imports easily,
// so we use crypto.randomUUID and a custom token generator.

export function newId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export function newToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

export function now() {
  return new Date().toISOString();
}
