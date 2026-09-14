import type { AdminRole } from './model';

export type LinkedAdminIdentity = {
  identityId: string;
  adminId: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'disabled';
  roles: AdminRole[];
};

export type StoredAdminSession = LinkedAdminIdentity & {
  authenticatedAt: Date;
  mfaVerifiedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export interface AdminSessionRepository {
  findLinkedIdentity(
    issuer: string,
    subject: string,
  ): Promise<LinkedAdminIdentity | null>;
  insertSession(input: {
    adminId: string;
    identityId: string;
    tokenHash: string;
    authenticatedAt: Date;
    mfaVerifiedAt: Date;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredAdminSession | null>;
  revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
  revokeAllSessions(adminId: string, revokedAt: Date): Promise<void>;
}
