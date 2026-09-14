// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { AdminSessionService } from '@/lib/auth/session-service';
import { AuthenticationError } from '@/lib/auth/model';
import { createAuditHandler } from '@/lib/audit/http';
import { redactAuditValue } from '@/lib/audit/redact';

const now = new Date('2026-09-14T01:00:00.000Z');

describe('audit boundary', () => {
  it('redacts sensitive keys and nested email values', () => {
    expect(
      redactAuditValue({
        title: 'Safe title',
        email: 'reader@example.com',
        nested: { tokenHash: 'secret', owner: 'admin@example.com' },
      }),
    ).toEqual({
      title: 'Safe title',
      email: '[REDACTED]',
      nested: { tokenHash: '[REDACTED]', owner: '[REDACTED_EMAIL]' },
    });
  });

  it('requires Admin and serializes only redacted records', async () => {
    const repository = {
      list: async () => [
        {
          id: '11111111-1111-4111-8111-111111111111',
          actorId: '22222222-2222-4222-8222-222222222222',
          actorName: 'Admin',
          action: 'newsletter.sent',
          objectType: 'newsletter_issue',
          objectId: '33333333-3333-4333-8333-333333333333',
          before: null,
          after: { recipientEmail: 'reader@example.com', status: 'sending' },
          requestId: 'request-audit',
          createdAt: now,
        },
      ],
    };
    const unauthenticated = createAuditHandler({
      createSessionService: () => serviceFor(null),
      createRepository: () => repository,
      now: () => now,
    });
    expect(
      (await unauthenticated(new Request('https://example.com/audit'))).status,
    ).toBe(401);

    const editor = createAuditHandler({
      createSessionService: () => serviceFor('editor'),
      createRepository: () => repository,
      now: () => now,
    });
    expect((await editor(authenticatedRequest())).status).toBe(403);

    const admin = createAuditHandler({
      createSessionService: () => serviceFor('admin'),
      createRepository: () => repository,
      now: () => now,
    });
    const response = await admin(authenticatedRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    expect(text).not.toContain('reader@example.com');
    expect(JSON.parse(text)).toMatchObject({
      items: [{ after: { recipientEmail: '[REDACTED]', status: 'sending' } }],
    });
  });
});

function serviceFor(role: 'editor' | 'admin' | null): AdminSessionService {
  return {
    getSession: async () => {
      if (!role) throw new AuthenticationError();
      return {
        adminId: '22222222-2222-4222-8222-222222222222',
        email: 'admin@example.com',
        displayName: 'Admin',
        roles: [role],
        authenticatedAt: now,
        mfaVerifiedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      };
    },
  } as unknown as AdminSessionService;
}

function authenticatedRequest() {
  return new Request('https://example.com/api/v1/admin/audit', {
    headers: { cookie: 'admin_session=test' },
  });
}
