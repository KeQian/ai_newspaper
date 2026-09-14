import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  adminIdentities,
  adminSessions,
  adminUserRoles,
  adminUsers,
  roles,
} from '@/db/schema';

import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from './session-repository';

export class DrizzleAdminSessionRepository implements AdminSessionRepository {
  constructor(private readonly database: Database) {}

  async findLinkedIdentity(
    issuer: string,
    subject: string,
  ): Promise<LinkedAdminIdentity | null> {
    const rows = await this.database
      .select({
        identityId: adminIdentities.id,
        adminId: adminUsers.id,
        email: adminUsers.email,
        displayName: adminUsers.displayName,
        status: adminUsers.status,
        role: roles.key,
      })
      .from(adminIdentities)
      .innerJoin(adminUsers, eq(adminIdentities.adminUserId, adminUsers.id))
      .leftJoin(adminUserRoles, eq(adminUserRoles.userId, adminUsers.id))
      .leftJoin(roles, eq(adminUserRoles.roleId, roles.id))
      .where(
        and(
          eq(adminIdentities.issuer, issuer),
          eq(adminIdentities.subject, subject),
        ),
      );

    if (rows.length === 0) return null;
    const [first] = rows;
    return {
      identityId: first.identityId,
      adminId: first.adminId,
      email: first.email,
      displayName: first.displayName,
      status: first.status,
      roles: rows.flatMap(({ role }) =>
        role ? [role] : [],
      ) as LinkedAdminIdentity['roles'],
    };
  }

  async insertSession(input: {
    adminId: string;
    identityId: string;
    tokenHash: string;
    authenticatedAt: Date;
    mfaVerifiedAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.insert(adminSessions).values({
      adminUserId: input.adminId,
      identityId: input.identityId,
      tokenHash: input.tokenHash,
      authenticatedAt: input.authenticatedAt,
      mfaVerifiedAt: input.mfaVerifiedAt,
      expiresAt: input.expiresAt,
    });
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredAdminSession | null> {
    const rows = await this.database
      .select({
        adminId: adminUsers.id,
        identityId: adminSessions.identityId,
        email: adminUsers.email,
        displayName: adminUsers.displayName,
        status: adminUsers.status,
        role: roles.key,
        authenticatedAt: adminSessions.authenticatedAt,
        mfaVerifiedAt: adminSessions.mfaVerifiedAt,
        expiresAt: adminSessions.expiresAt,
        revokedAt: adminSessions.revokedAt,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
      .leftJoin(adminUserRoles, eq(adminUserRoles.userId, adminUsers.id))
      .leftJoin(roles, eq(adminUserRoles.roleId, roles.id))
      .where(eq(adminSessions.tokenHash, tokenHash));

    if (rows.length === 0) return null;
    const [first] = rows;
    return {
      adminId: first.adminId,
      identityId: first.identityId,
      email: first.email,
      displayName: first.displayName,
      status: first.status,
      roles: rows.flatMap(({ role }) =>
        role ? [role] : [],
      ) as StoredAdminSession['roles'],
      authenticatedAt: first.authenticatedAt,
      mfaVerifiedAt: first.mfaVerifiedAt,
      expiresAt: first.expiresAt,
      revokedAt: first.revokedAt,
    };
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.database
      .update(adminSessions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          isNull(adminSessions.revokedAt),
        ),
      );
  }

  async revokeAllSessions(adminId: string, revokedAt: Date): Promise<void> {
    await this.database
      .update(adminSessions)
      .set({ revokedAt, updatedAt: revokedAt })
      .where(
        and(
          eq(adminSessions.adminUserId, adminId),
          isNull(adminSessions.revokedAt),
        ),
      );
  }
}
