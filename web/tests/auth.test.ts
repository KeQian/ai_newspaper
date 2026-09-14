// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  clearAdminSessionCookie,
  readAdminSessionToken,
  serializeAdminSessionCookie,
} from '@/lib/auth/cookie';
import { requireSameOrigin } from '@/lib/auth/csrf';
import { createDevelopmentIdentity } from '@/lib/auth/development-identity';
import { parseProductionAuthEnvironment } from '@/lib/auth/environment';
import {
  AuthenticationError,
  type AdminRole,
  type AdminSession,
} from '@/lib/auth/model';
import {
  hasPermission,
  requirePermission,
  requireRecentMfa,
  requiresRecentMfa,
} from '@/lib/auth/permissions';
import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from '@/lib/auth/session-repository';
import { createAdminSessionHandlers } from '@/lib/auth/session-http';
import { AdminSessionService } from '@/lib/auth/session-service';

const now = new Date('2026-09-11T08:00:00.000Z');

describe('RBAC matrix', () => {
  it.each([
    ['editor', 'content.edit', true],
    ['editor', 'content.publish', false],
    ['editor', 'source.manage', false],
    ['chief_editor', 'content.publish', true],
    ['chief_editor', 'newsletter.send', true],
    ['chief_editor', 'run.retry', false],
    ['admin', 'content.publish', true],
    ['admin', 'source.manage', true],
    ['admin', 'role.manage', true],
  ] as const)('%s / %s => %s', (role, permission, allowed) => {
    expect(hasPermission([role], permission)).toBe(allowed);
  });

  it('rejects a forbidden action and stale MFA', () => {
    const session = makeSession(['editor']);
    expect(() => requirePermission(session, 'content.publish')).toThrow(
      'Permission denied',
    );
    expect(() => requireRecentMfa(session, now, 15)).not.toThrow();
    expect(() =>
      requireRecentMfa(
        { ...session, mfaVerifiedAt: new Date('2026-09-11T07:00:00Z') },
        now,
        15,
      ),
    ).toThrow('Recent MFA verification required');
  });

  it('classifies high-impact mutations as recent-MFA operations', () => {
    expect(requiresRecentMfa('content.publish')).toBe(true);
    expect(requiresRecentMfa('content.withdraw')).toBe(true);
    expect(requiresRecentMfa('newsletter.send')).toBe(true);
    expect(requiresRecentMfa('role.manage')).toBe(true);
    expect(requiresRecentMfa('content.edit')).toBe(false);
  });
});

describe('administrator session service', () => {
  it('creates an opaque session for an active, allowlisted, MFA identity', async () => {
    const repository = new MemorySessionRepository(makeIdentity(['editor']));
    const service = new AdminSessionService(repository, {
      allowedEmails: new Set(['editor@example.com']),
      sessionTtlMinutes: 240,
    });

    const established = await service.establishSession(makeOidcIdentity(), now);
    expect(established.token).toHaveLength(43);
    expect(repository.lastTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.lastTokenHash).not.toContain(established.token);
    await expect(
      service.getSession(established.token, now),
    ).resolves.toMatchObject({
      email: 'editor@example.com',
      roles: ['editor'],
    });
  });

  it('uses one generic denial path for unlinked, disabled, or non-allowlisted identities', async () => {
    const cases: Array<[LinkedAdminIdentity | null, ReadonlySet<string>]> = [
      [null, new Set(['editor@example.com'])],
      [
        { ...makeIdentity(['editor']), status: 'disabled' },
        new Set(['editor@example.com']),
      ],
      [makeIdentity(['editor']), new Set(['someone@example.com'])],
    ];

    for (const [identity, allowedEmails] of cases) {
      const service = new AdminSessionService(
        new MemorySessionRepository(identity),
        {
          allowedEmails,
          sessionTtlMinutes: 240,
        },
      );
      await expect(
        service.establishSession(makeOidcIdentity(), now),
      ).rejects.toThrow('Administrator access denied');
    }
  });

  it('rejects missing MFA assurance, expiry, revocation, and account disablement', async () => {
    const repository = new MemorySessionRepository(
      makeIdentity(['chief_editor']),
    );
    const service = new AdminSessionService(repository, {
      allowedEmails: new Set(['editor@example.com']),
      sessionTtlMinutes: 15,
    });

    await expect(
      service.establishSession(
        {
          ...makeOidcIdentity(),
          mfaVerifiedAt: new Date('2026-09-11T07:59:00Z'),
        },
        now,
      ),
    ).rejects.toThrow('Invalid identity assurance');

    const { token } = await service.establishSession(makeOidcIdentity(), now);
    await expect(
      service.getSession(token, new Date('2026-09-11T08:16:00Z')),
    ).rejects.toBeInstanceOf(AuthenticationError);

    await service.endSession(token, now);
    await expect(service.getSession(token, now)).rejects.toBeInstanceOf(
      AuthenticationError,
    );

    const second = await service.establishSession(makeOidcIdentity(), now);
    repository.identity = {
      ...makeIdentity(['chief_editor']),
      status: 'disabled',
    };
    await expect(service.getSession(second.token, now)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});

describe('request security helpers', () => {
  it('uses a secure, HTTP-only, strict cookie and can clear it', () => {
    const serialized = serializeAdminSessionCookie(
      'secret',
      new Date('2026-09-11T12:00:00Z'),
    );
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Secure');
    expect(serialized).toContain('SameSite=Strict');
    expect(clearAdminSessionCookie()).toContain('Max-Age=0');

    const request = new Request('https://admin.example.com/api', {
      headers: { cookie: 'theme=dark; admin_session=secret; another=value' },
    });
    expect(readAdminSessionToken(request)).toBe('secret');
  });

  it('rejects cross-origin unsafe requests', () => {
    expect(() =>
      requireSameOrigin(
        new Request('https://admin.example.com/api', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toThrow('Invalid request origin');
  });

  it('requires complete production OIDC configuration and disables development auth', () => {
    expect(() => parseProductionAuthEnvironment({})).toThrow();
    expect(() =>
      createDevelopmentIdentity(makeOidcIdentity(), {
        NODE_ENV: 'production',
        ENABLE_DEV_AUTH: 'true',
      }),
    ).toThrow('Development authentication is disabled');
  });
});

describe('administrator session HTTP contract', () => {
  it('returns a no-store session response and securely revokes it', async () => {
    const service = new AdminSessionService(
      new MemorySessionRepository(makeIdentity(['chief_editor'])),
      {
        allowedEmails: new Set(['editor@example.com']),
        sessionTtlMinutes: 240,
      },
    );
    const { token } = await service.establishSession(makeOidcIdentity(), now);
    const handlers = createAdminSessionHandlers(
      () => service,
      () => now,
    );
    const url = 'https://admin.example.com/api/v1/admin/session';

    const response = await handlers.GET(
      new Request(url, { headers: { cookie: `admin_session=${token}` } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      email: 'editor@example.com',
      roles: ['chief_editor'],
    });

    const logout = await handlers.DELETE(
      new Request(url, {
        method: 'DELETE',
        headers: {
          cookie: `admin_session=${token}`,
          origin: 'https://admin.example.com',
        },
      }),
    );
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(service.getSession(token, now)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it('returns generic 401 and 403 responses', async () => {
    const service = new AdminSessionService(new MemorySessionRepository(null), {
      allowedEmails: new Set(['editor@example.com']),
      sessionTtlMinutes: 240,
    });
    const handlers = createAdminSessionHandlers(() => service);
    const url = 'https://admin.example.com/api/v1/admin/session';

    expect((await handlers.GET(new Request(url))).status).toBe(401);
    expect(
      (
        await handlers.DELETE(
          new Request(url, {
            method: 'DELETE',
            headers: { origin: 'https://attacker.example' },
          }),
        )
      ).status,
    ).toBe(403);
  });
});

class MemorySessionRepository implements AdminSessionRepository {
  lastTokenHash: string | null = null;
  private stored: StoredAdminSession | null = null;

  constructor(public identity: LinkedAdminIdentity | null) {}

  async findLinkedIdentity(): Promise<LinkedAdminIdentity | null> {
    return this.identity;
  }

  async insertSession(input: {
    tokenHash: string;
    authenticatedAt: Date;
    mfaVerifiedAt: Date;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.identity) throw new Error('Missing identity');
    this.lastTokenHash = input.tokenHash;
    this.stored = { ...this.identity, ...input, revokedAt: null };
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredAdminSession | null> {
    if (!this.stored || tokenHash !== this.lastTokenHash) return null;
    return this.identity ? { ...this.stored, ...this.identity } : null;
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    if (this.stored && tokenHash === this.lastTokenHash)
      this.stored.revokedAt = revokedAt;
  }

  async revokeAllSessions(adminId: string, revokedAt: Date): Promise<void> {
    if (this.stored?.adminId === adminId) this.stored.revokedAt = revokedAt;
  }
}

function makeIdentity(roles: AdminRole[]): LinkedAdminIdentity {
  return {
    identityId: '10000000-0000-4000-8000-000000000001',
    adminId: '20000000-0000-4000-8000-000000000001',
    email: 'editor@example.com',
    displayName: 'Editor',
    status: 'active',
    roles,
  };
}

function makeOidcIdentity() {
  return {
    issuer: 'https://id.example.com',
    subject: 'oidc-subject',
    email: 'EDITOR@example.com',
    emailVerified: true,
    authenticatedAt: now,
    mfaVerifiedAt: now,
  };
}

function makeSession(roles: AdminRole[]): AdminSession {
  return {
    adminId: '20000000-0000-4000-8000-000000000001',
    email: 'editor@example.com',
    displayName: 'Editor',
    roles,
    authenticatedAt: now,
    mfaVerifiedAt: now,
    expiresAt: new Date('2026-09-11T12:00:00Z'),
  };
}
