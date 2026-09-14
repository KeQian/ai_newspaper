// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AdminRole } from '@/lib/auth/model';
import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from '@/lib/auth/session-repository';
import { AdminSessionService } from '@/lib/auth/session-service';
import { hashSessionToken } from '@/lib/auth/session-token';
import {
  createAdminNewsletterHandlers,
  createPublicNewsletterHandlers,
} from '@/lib/newsletter/http';

const now = new Date('2026-09-13T08:00:00Z');
const issueId = '10000000-0000-4000-8000-000000000001';

describe('public newsletter HTTP boundary', () => {
  it('returns the same generic response without exposing subscriber state', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    const handlers = createPublicNewsletterHandlers({
      createService: () => ({ subscribe }) as never,
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
      },
      now: () => now,
    });
    const response = await handlers.subscribe(
      publicRequest({ email: 'Reader@Example.com', consent: true }),
    );
    expect(response.status).toBe(202);
    expect(await response.text()).not.toContain('Reader@Example.com');
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it('rejects cross-origin, invalid and rate-limited submissions safely', async () => {
    const service = { subscribe: vi.fn() };
    const denied = createPublicNewsletterHandlers({
      createService: () => service as never,
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: false, retryAfter: 60 }),
      },
      now: () => now,
    });
    expect(
      (
        await denied.subscribe(
          publicRequest(
            { email: 'valid@example.com', consent: true },
            'https://attacker.test',
          ),
        )
      ).status,
    ).toBe(403);
    const invalid = await denied.subscribe(
      publicRequest({ email: 'not-an-email', consent: true }),
    );
    expect(invalid.status).toBe(400);
    const limited = await denied.subscribe(
      publicRequest({ email: 'valid@example.com', consent: true }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(service.subscribe).not.toHaveBeenCalled();
  });
});

describe('admin newsletter HTTP boundary', () => {
  let handlers: ReturnType<typeof createAdminNewsletterHandlers>;
  const queueSend = vi.fn().mockResolvedValue({ recipientCount: 1 });

  beforeAll(async () => {
    const sessions = new MemorySessionRepository();
    await sessions.add('editor-token', ['editor'], now);
    await sessions.add('chief-token', ['chief_editor'], now);
    await sessions.add(
      'stale-chief-token',
      ['chief_editor'],
      new Date('2026-09-13T07:30:00Z'),
    );
    handlers = createAdminNewsletterHandlers({
      createSessionService: () =>
        new AdminSessionService(sessions, {
          allowedEmails: new Set(),
          sessionTtlMinutes: 240,
        }),
      createService: () => ({ queueSend }) as never,
      now: () => now,
    });
  });

  it('blocks editors and stale MFA while allowing a recently verified chief editor', async () => {
    expect(
      (await handlers.send(editorRequest('editor-token'), issueId)).status,
    ).toBe(403);
    expect(
      (await handlers.send(editorRequest('stale-chief-token'), issueId)).status,
    ).toBe(403);
    const accepted = await handlers.send(editorRequest('chief-token'), issueId);
    expect(accepted.status).toBe(202);
    expect(accepted.headers.get('cache-control')).toBe('private, no-store');
    expect(queueSend).toHaveBeenCalledOnce();
  });
});

function publicRequest(body: unknown, origin = 'https://example.test') {
  return new Request('https://example.test/api/v1/newsletter/subscriptions', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'idempotency-key': 'subscription-key-0001',
    },
    body: JSON.stringify(body),
  });
}

function editorRequest(token: string) {
  return new Request(
    `https://example.test/api/v1/admin/newsletters/${issueId}/send`,
    {
      method: 'POST',
      headers: {
        origin: 'https://example.test',
        cookie: `admin_session=${token}`,
        'idempotency-key': 'newsletter-send-key-0001',
      },
    },
  );
}

class MemorySessionRepository implements AdminSessionRepository {
  private readonly sessions = new Map<string, StoredAdminSession>();
  async add(token: string, roles: AdminRole[], mfaVerifiedAt: Date) {
    this.sessions.set(await hashSessionToken(token), {
      identityId: crypto.randomUUID(),
      adminId: crypto.randomUUID(),
      email: `${roles[0]}@example.com`,
      displayName: roles[0],
      status: 'active',
      roles,
      authenticatedAt: new Date('2026-09-13T07:00:00Z'),
      mfaVerifiedAt,
      expiresAt: new Date('2026-09-13T12:00:00Z'),
      revokedAt: null,
    });
  }
  async findLinkedIdentity(): Promise<LinkedAdminIdentity | null> {
    return null;
  }
  async insertSession(): Promise<void> {}
  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }
  async revokeSession(): Promise<void> {}
  async revokeAllSessions(): Promise<void> {}
}
