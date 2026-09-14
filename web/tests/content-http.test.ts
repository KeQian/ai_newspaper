// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest';

import type { AdminRole } from '@/lib/auth/model';
import type {
  AdminSessionRepository,
  LinkedAdminIdentity,
  StoredAdminSession,
} from '@/lib/auth/session-repository';
import { AdminSessionService } from '@/lib/auth/session-service';
import { hashSessionToken } from '@/lib/auth/session-token';
import { createContentHandlers } from '@/lib/content/http';
import { ContentService } from '@/lib/content/service';
import type {
  ContentDetail,
  ContentMutationResult,
  ContentRepository,
  ContentSummary,
} from '@/lib/content/types';

const now = new Date('2026-09-12T08:00:00.000Z');
const contentId = '10000000-0000-4000-8000-000000000001';
let handlers: ReturnType<typeof createContentHandlers>;

describe('content HTTP security boundary', () => {
  beforeAll(async () => {
    const sessions = new MemorySessionRepository();
    await sessions.add('editor-token', ['editor'], now);
    await sessions.add(
      'chief-stale-token',
      ['chief_editor'],
      new Date('2026-09-12T07:30:00Z'),
    );
    await sessions.add('chief-token', ['chief_editor'], now);
    const sessionService = new AdminSessionService(sessions, {
      allowedEmails: new Set(),
      sessionTtlMinutes: 240,
    });
    handlers = createContentHandlers({
      createSessionService: () => sessionService,
      createContentService: () =>
        new ContentService(new MemoryContentRepository()),
      now: () => now,
    });
  });

  it('requires authentication and same-origin requests', async () => {
    const denied = await handlers.list(
      new Request('https://example.com/api/v1/admin/content'),
    );
    expect(denied.status).toBe(401);
    const csrf = await handlers.update(
      request('editor-token', {
        method: 'PATCH',
        origin: 'https://attacker.example',
        body: JSON.stringify(updateInput()),
      }),
      contentId,
    );
    expect(csrf.status).toBe(403);
  });

  it('allows editors to save but never to publish', async () => {
    const saved = await handlers.update(
      request('editor-token', {
        method: 'PATCH',
        body: JSON.stringify(updateInput()),
      }),
      contentId,
    );
    expect(saved.status).toBe(200);
    const published = await handlers.transition(
      request('editor-token', {
        method: 'POST',
        body: JSON.stringify({ version: 1 }),
      }),
      contentId,
      'publish',
    );
    expect(published.status).toBe(403);
  });

  it('requires recent MFA for chief-editor publication', async () => {
    const stale = await handlers.transition(
      request('chief-stale-token', {
        method: 'POST',
        body: JSON.stringify({ version: 1 }),
      }),
      contentId,
      'publish',
    );
    expect(stale.status).toBe(403);
    const accepted = await handlers.transition(
      request('chief-token', {
        method: 'POST',
        body: JSON.stringify({ version: 1 }),
      }),
      contentId,
      'publish',
    );
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('cache-control')).toBe('private, no-store');
  });
});

class MemoryContentRepository implements ContentRepository {
  async list(): Promise<{ items: ContentSummary[]; hasMore: boolean }> {
    return { items: [], hasMore: false };
  }
  async get(): Promise<ContentDetail | null> {
    return null;
  }
  async create(): Promise<ContentMutationResult> {
    return result('draft');
  }
  async update(): Promise<ContentMutationResult> {
    return result('draft');
  }
  async transition(
    input: Parameters<ContentRepository['transition']>[0],
  ): Promise<ContentMutationResult> {
    return result(input.action.type === 'withdraw' ? 'withdrawn' : 'published');
  }
  async correct(): Promise<ContentMutationResult> {
    return result('updated');
  }
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
      authenticatedAt: new Date('2026-09-12T07:00:00Z'),
      mfaVerifiedAt,
      expiresAt: new Date('2026-09-12T12:00:00Z'),
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

function request(
  token: string,
  options: { method: string; body: string; origin?: string },
) {
  return new Request(`https://example.com/api/v1/admin/content/${contentId}`, {
    method: options.method,
    headers: {
      cookie: `admin_session=${token}`,
      origin: options.origin ?? 'https://example.com',
      'content-type': 'application/json',
    },
    body: options.body,
  });
}
function updateInput() {
  return {
    version: 1,
    type: 'news',
    title: '标题',
    dek: '',
    summary: '摘要',
    body: {
      schemaVersion: 1,
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
      ],
    },
    verification: 'confirmed',
    importance: 4,
    actionability: 4,
    sourceIds: ['20000000-0000-4000-8000-000000000002'],
    topicIds: [],
    seo: { title: '标题', description: '摘要' },
    aiDisclosure: { assisted: false, note: '' },
    changeSummary: '修改',
  };
}
function result(status: string): ContentMutationResult {
  return { id: contentId, status, version: 1 };
}
