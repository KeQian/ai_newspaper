import { AuthorizationError } from './model';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireSameOrigin(request: Request): void {
  if (safeMethods.has(request.method.toUpperCase())) return;

  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AuthorizationError('Invalid request origin');
  }
}
