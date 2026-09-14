// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest';

import { createAdminIngestionHandlers } from '@/lib/ingestion/admin-http';
import type {
  IngestionRunRepository,
  SourceRegistryRepository,
  StoredIngestionRun,
} from '@/lib/ingestion/repository';
import { SourceRegistryService } from '@/lib/ingestion/source-service';
import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from '@/lib/auth/session-repository';
import { AdminSessionService } from '@/lib/auth/session-service';

const now = new Date('2026-09-11T08:00:00.000Z');
let adminToken = '';

describe('administrator ingestion read APIs', () => {
  let handlers: ReturnType<typeof createAdminIngestionHandlers>;

  beforeAll(async () => {
    const sessionRepository = new MemoryAdminSessionRepository();
    const sessionService = new AdminSessionService(sessionRepository, {
      allowedEmails: new Set(['editor@example.com']),
      sessionTtlMinutes: 240,
    });
    adminToken = (
      await sessionService.establishSession(
        {
          issuer: 'https://id.example.com',
          subject: 'editor-subject',
          email: 'editor@example.com',
          emailVerified: true,
          authenticatedAt: now,
          mfaVerifiedAt: now,
        },
        now,
      )
    ).token;
    const ingestionRepository = new MemoryIngestionRepository();
    handlers = createAdminIngestionHandlers({
      createSessionService: () => sessionService,
      createSourceService: () => new SourceRegistryService(ingestionRepository),
      createRunRepository: () => ingestionRepository,
      now: () => now,
    });
  });

  it('requires an editor session and returns derived source health', async () => {
    const unauthorized = await handlers.listSources(
      new Request('https://example.com/api/v1/admin/sources'),
    );
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toMatchObject({
      code: 'UNAUTHORIZED',
      requestId: expect.any(String),
    });

    const response = await handlers.listSources(
      authenticatedRequest('sources'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      items: [{ key: 'example', healthStatus: 'unknown' }],
    });
  });

  it('returns a contract-safe error for an invalid run cursor', async () => {
    const response = await handlers.listRuns(
      authenticatedRequest('runs?cursor=not-a-cursor'),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      requestId: expect.any(String),
    });
  });
});

class MemoryAdminSessionRepository implements AdminSessionRepository {
  private session: StoredAdminSession | null = null;
  private sessionTokenHash: string | null = null;

  async findLinkedIdentity(): Promise<LinkedAdminIdentity> {
    return {
      identityId: '743f7207-f8a0-46f8-a2e6-37812bb033d2',
      adminId: 'd3806439-abf3-45d0-9ebf-29004e0b39c6',
      email: 'editor@example.com',
      displayName: 'Editor',
      status: 'active',
      roles: ['editor'],
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
    this.sessionTokenHash = input.tokenHash;
    this.session = {
      adminId: input.adminId,
      identityId: input.identityId,
      email: 'editor@example.com',
      displayName: 'Editor',
      status: 'active',
      roles: ['editor'],
      authenticatedAt: input.authenticatedAt,
      mfaVerifiedAt: input.mfaVerifiedAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessionTokenHash === tokenHash ? this.session : null;
  }

  async revokeSession(): Promise<void> {}
  async revokeAllSessions(): Promise<void> {}
}

class MemoryIngestionRepository
  implements SourceRegistryRepository, IngestionRunRepository
{
  async importSources() {
    return { created: 0, updated: 0, unchanged: 0, total: 0 };
  }

  async listSources() {
    return [
      {
        id: 'b30bde89-f818-472d-8e07-70b5f61aef17',
        key: 'example',
        name: 'Example',
        sourceType: 'api',
        reliability: 's0',
        enabled: true,
        schedule: 'hourly',
        termsStatus: 'approved',
        lastSuccessAt: null,
        failureCount: 0,
        version: 1,
      },
    ];
  }

  async createOrGetRun(): Promise<{
    run: StoredIngestionRun;
    reused: boolean;
  }> {
    throw new Error('Not used');
  }

  async listRuns() {
    return [];
  }

  async getRun() {
    return null;
  }
}

function authenticatedRequest(path: string): Request {
  return new Request(`https://example.com/api/v1/admin/${path}`, {
    headers: { cookie: `admin_session=${adminToken}` },
  });
}
