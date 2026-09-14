export const adminSessionCookieName = 'admin_session';

export function readAdminSessionToken(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;

  for (const pair of cookie.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;

    const name = pair.slice(0, separator).trim();
    if (name === adminSessionCookieName) {
      const value = pair.slice(separator + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export function serializeAdminSessionCookie(
  token: string,
  expiresAt: Date,
): string {
  return [
    `${adminSessionCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Expires=${expiresAt.toUTCString()}`,
  ].join('; ');
}

export function clearAdminSessionCookie(): string {
  return `${adminSessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
