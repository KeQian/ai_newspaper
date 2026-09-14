import { AuthorizationError, type AdminRole, type AdminSession } from './model';

export const permissions = [
  'candidate.read',
  'candidate.decide',
  'content.read',
  'content.edit',
  'content.publish',
  'content.withdraw',
  'source.read',
  'source.manage',
  'run.read',
  'run.retry',
  'entity.read',
  'entity.edit',
  'entity.merge',
  'newsletter.read',
  'newsletter.edit',
  'newsletter.send_test',
  'newsletter.send',
  'audit.read',
  'role.manage',
  'credential.manage',
] as const;

export type Permission = (typeof permissions)[number];

const editorPermissions = new Set<Permission>([
  'candidate.read',
  'candidate.decide',
  'content.read',
  'content.edit',
  'source.read',
  'run.read',
  'entity.read',
  'entity.edit',
  'entity.merge',
  'newsletter.read',
  'newsletter.edit',
  'newsletter.send_test',
]);

const rolePermissions: Record<AdminRole, ReadonlySet<Permission>> = {
  editor: editorPermissions,
  chief_editor: new Set([
    ...editorPermissions,
    'content.publish',
    'content.withdraw',
    'newsletter.send',
  ]),
  admin: new Set(permissions),
};

const recentMfaPermissions = new Set<Permission>([
  'content.publish',
  'content.withdraw',
  'newsletter.send',
  'role.manage',
  'credential.manage',
]);

export function hasPermission(
  roles: readonly AdminRole[],
  permission: Permission,
): boolean {
  return roles.some((role) => rolePermissions[role].has(permission));
}

export function requirePermission(
  session: AdminSession,
  permission: Permission,
): void {
  if (!hasPermission(session.roles, permission)) {
    throw new AuthorizationError();
  }
}

export function requiresRecentMfa(permission: Permission): boolean {
  return recentMfaPermissions.has(permission);
}

export function requireRecentMfa(
  session: AdminSession,
  now: Date,
  maximumAgeMinutes: number,
): void {
  const ageMs = now.getTime() - session.mfaVerifiedAt.getTime();

  if (ageMs < 0 || ageMs > maximumAgeMinutes * 60_000) {
    throw new AuthorizationError('Recent MFA verification required');
  }
}
