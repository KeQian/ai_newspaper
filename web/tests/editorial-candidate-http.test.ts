// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest';

import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from '@/lib/auth/session-repository';
import { AdminSessionService } from '@/lib/auth/session-service';
import { createEditorialCandidateHandlers } from '@/lib/editorial/candidates/http';
import { EditorialCandidateService } from '@/lib/editorial/candidates/service';
import type {
  CandidateDetail,
  CandidateDecisionResult,
  CandidateListItem,
  EditorialCandidateRepository,
} from '@/lib/editorial/candidates/types';

const now = new Date('2026-09-12T08:00:00.000Z');
const candidateId = '10000000-0000-4000-8000-000000000001';
let token = '';

describe('editorial candidate HTTP boundary', () => {
  let handlers: ReturnType<typeof createEditorialCandidateHandlers>;

  beforeAll(async () => {
    const sessions = new MemorySessionRepository();
    const sessionService = new AdminSessionService(sessions, {
      allowedEmails: new Set(['editor@example.com']),
      sessionTtlMinutes: 240,
    });
    token = (
      await sessionService.establishSession(
        {
          issuer: 'https://id.example.com',
          subject: 'editor',
          email: 'editor@example.com',
          emailVerified: true,
          authenticatedAt: now,
          mfaVerifiedAt: now,
        },
        now,
      )
    ).token;
    handlers = createEditorialCandidateHandlers({
      createSessionService: () => sessionService,
      createCandidateService: () =>
        new EditorialCandidateService(new MemoryCandidateRepository()),
      now: () => now,
    });
  });

  it('requires a session for list and returns private data when authorized', async () => {
    const denied = await handlers.list(
      new Request('https://example.com/api/v1/admin/candidates'),
    );
    expect(denied.status).toBe(401);
    const response = await handlers.list(
      authenticatedRequest('candidates?status=review'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: candidateId }],
      hasMore: false,
    });

    const defaults = await handlers.list(authenticatedRequest('candidates'));
    expect(defaults.status).toBe(200);
  });

  it('rejects cross-origin decisions and accepts validated same-origin decisions', async () => {
    const crossOrigin = await handlers.decide(
      authenticatedRequest(`candidates/${candidateId}/decision`, {
        method: 'POST',
        origin: 'https://attacker.example',
        body: JSON.stringify({
          action: 'reject',
          version: 1,
          reason: 'duplicate',
        }),
      }),
      candidateId,
    );
    expect(crossOrigin.status).toBe(403);
    const accepted = await handlers.decide(
      authenticatedRequest(`candidates/${candidateId}/decision`, {
        method: 'POST',
        origin: 'https://example.com',
        body: JSON.stringify({
          action: 'reject',
          version: 1,
          reason: 'duplicate',
        }),
      }),
      candidateId,
    );
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      id: candidateId,
      status: 'rejected',
      requestId: expect.any(String),
    });
  });
});

class MemoryCandidateRepository implements EditorialCandidateRepository {
  async list(): Promise<{ items: CandidateListItem[]; hasMore: boolean }> {
    return { items: [candidate()], hasMore: false };
  }
  async get(): Promise<CandidateDetail | null> {
    return null;
  }
  async decide(): Promise<CandidateDecisionResult> {
    return { id: candidateId, status: 'rejected', version: 2 };
  }
}

function candidate(): CandidateListItem {
  return {
    id: candidateId,
    title: 'Candidate',
    factSummary: 'Fact',
    occurredAt: now,
    status: 'review',
    verification: 'confirmed',
    importance: 4,
    actionability: 4,
    confidence: 0.9,
    riskFlags: [],
    sourceCount: 1,
    primarySource: 'Official',
    deferredUntil: null,
    createdAt: now,
    version: 1,
  };
}

class MemorySessionRepository implements AdminSessionRepository {
  private tokenHash = '';
  private session: StoredAdminSession | null = null;
  async findLinkedIdentity(): Promise<LinkedAdminIdentity> {
    return {
      identityId: '20000000-0000-4000-8000-000000000002',
      adminId: '30000000-0000-4000-8000-000000000003',
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
    this.tokenHash = input.tokenHash;
    this.session = {
      ...input,
      email: 'editor@example.com',
      displayName: 'Editor',
      status: 'active',
      roles: ['editor'],
      revokedAt: null,
    };
  }
  async findSessionByTokenHash(tokenHash: string) {
    return tokenHash === this.tokenHash ? this.session : null;
  }
  async revokeSession(): Promise<void> {}
  async revokeAllSessions(): Promise<void> {}
}

function authenticatedRequest(
  path: string,
  options: { method?: string; origin?: string; body?: string } = {},
) {
  const headers: Record<string, string> = {
    cookie: `admin_session=${token}`,
    'content-type': 'application/json',
  };
  if (options.origin) headers.origin = options.origin;
  return new Request(`https://example.com/api/v1/admin/${path}`, {
    method: options.method,
    headers,
    body: options.body,
  });
}
