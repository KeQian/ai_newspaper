import { readAdminSessionToken } from './cookie';
import type { AdminSession } from './model';
import type { Permission } from './permissions';
import {
  requirePermission,
  requireRecentMfa,
  requiresRecentMfa,
} from './permissions';
import type { AdminSessionService } from './session-service';

export async function requireAdminSession(
  request: Request,
  service: AdminSessionService,
): Promise<AdminSession> {
  return service.getSession(readAdminSessionToken(request));
}

export async function requireAdminPermission(
  request: Request,
  service: AdminSessionService,
  permission: Permission,
  options: { now?: Date; recentMfaMinutes?: number } = {},
): Promise<AdminSession> {
  const session = await requireAdminSession(request, service);
  requirePermission(session, permission);

  if (requiresRecentMfa(permission)) {
    requireRecentMfa(
      session,
      options.now ?? new Date(),
      options.recentMfaMinutes ?? 15,
    );
  }

  return session;
}
