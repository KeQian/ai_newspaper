import {
  adminRoleSchema,
  AuthenticationError,
  verifiedOidcIdentitySchema,
} from './model';
import type { AdminSession, VerifiedOidcIdentity } from './model';
import type { AdminSessionRepository } from './session-repository';
import { createSessionToken, hashSessionToken } from './session-token';

export type AdminSessionPolicy = {
  allowedEmails: ReadonlySet<string>;
  sessionTtlMinutes: number;
};

export class AdminSessionService {
  constructor(
    private readonly repository: AdminSessionRepository,
    private readonly policy: AdminSessionPolicy,
  ) {}

  async establishSession(
    untrustedIdentity: unknown,
    now = new Date(),
  ): Promise<{ token: string; session: AdminSession }> {
    const identity = verifiedOidcIdentitySchema.parse(untrustedIdentity);
    this.assertIdentityAssurance(identity, now);

    const linked = await this.repository.findLinkedIdentity(
      identity.issuer,
      identity.subject,
    );
    const normalizedEmail = identity.email.toLowerCase();

    if (
      !linked ||
      linked.status !== 'active' ||
      linked.email.toLowerCase() !== normalizedEmail ||
      !this.policy.allowedEmails.has(normalizedEmail)
    ) {
      throw new AuthenticationError('Administrator access denied');
    }

    const roles = adminRoleSchema.array().min(1).parse(linked.roles);
    const expiresAt = new Date(
      now.getTime() + this.policy.sessionTtlMinutes * 60_000,
    );
    const { token, tokenHash } = await createSessionToken();

    await this.repository.insertSession({
      adminId: linked.adminId,
      identityId: linked.identityId,
      tokenHash,
      authenticatedAt: identity.authenticatedAt,
      mfaVerifiedAt: identity.mfaVerifiedAt,
      expiresAt,
    });

    return {
      token,
      session: {
        adminId: linked.adminId,
        email: linked.email,
        displayName: linked.displayName,
        roles,
        authenticatedAt: identity.authenticatedAt,
        mfaVerifiedAt: identity.mfaVerifiedAt,
        expiresAt,
      },
    };
  }

  async getSession(
    token: string | null,
    now = new Date(),
  ): Promise<AdminSession> {
    if (!token) throw new AuthenticationError();

    const stored = await this.repository.findSessionByTokenHash(
      await hashSessionToken(token),
    );
    if (
      !stored ||
      stored.status !== 'active' ||
      stored.revokedAt ||
      stored.expiresAt <= now
    ) {
      throw new AuthenticationError();
    }

    const roles = adminRoleSchema.array().min(1).parse(stored.roles);
    return {
      adminId: stored.adminId,
      email: stored.email,
      displayName: stored.displayName,
      roles,
      authenticatedAt: stored.authenticatedAt,
      mfaVerifiedAt: stored.mfaVerifiedAt,
      expiresAt: stored.expiresAt,
    };
  }

  async endSession(token: string | null, now = new Date()): Promise<void> {
    if (!token) return;
    await this.repository.revokeSession(await hashSessionToken(token), now);
  }

  async revokeAdministrator(adminId: string, now = new Date()): Promise<void> {
    await this.repository.revokeAllSessions(adminId, now);
  }

  private assertIdentityAssurance(
    identity: VerifiedOidcIdentity,
    now: Date,
  ): void {
    if (
      identity.authenticatedAt > now ||
      identity.mfaVerifiedAt < identity.authenticatedAt ||
      identity.mfaVerifiedAt > now
    ) {
      throw new AuthenticationError('Invalid identity assurance');
    }
  }
}
