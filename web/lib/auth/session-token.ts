const SESSION_TOKEN_BYTES = 32;

export async function createSessionToken(): Promise<{
  token: string;
  tokenHash: string;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  const token = toBase64Url(bytes);
  return { token, tokenHash: await hashSessionToken(token) };
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
