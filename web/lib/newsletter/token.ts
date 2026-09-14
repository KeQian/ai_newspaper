export function createOpaqueToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(value);
}

export async function hashNewsletterValue(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return base64Url(new Uint8Array(digest));
}

export async function createUnsubscribeToken(
  subscriberId: string,
  secret: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`unsubscribe:${subscriberId}`),
  );
  return `${subscriberId}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
