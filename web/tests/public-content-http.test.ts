// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPublicContentHandlers } from '@/lib/public-content/http';
import { PublicContentService } from '@/lib/public-content/service';
import type {
  PublicContentListItem,
  PublicContentLookup,
  PublicContentRepository,
  PublicTopicLookup,
  PublicTopicSummary,
} from '@/lib/public-content/types';

describe('public content HTTP contract', () => {
  it('returns public cache policy and serializes a list', async () => {
    const response = await handlers().list(
      new Request('https://example.com/api/v1/content?type=news&limit=1'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    await expect(response.json()).resolves.toMatchObject({
      items: [{ slug: 'test-story' }],
      nextCursor: null,
    });
  });

  it('rejects unknown query fields and does not cache errors', async () => {
    const response = await handlers().list(
      new Request('https://example.com/api/v1/content?unknown=true'),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      code: 'BAD_REQUEST',
      requestId: expect.any(String),
    });
  });

  it('returns an explicit 301 for historical slugs', async () => {
    const response = await handlers({
      kind: 'redirect',
      location: '/news/test-story',
    }).get(
      new Request('https://example.com/api/v1/content/old-story'),
      'old-story',
    );
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(
      'https://example.com/news/test-story',
    );
  });

  it('maps repository failures to a non-cacheable 503', async () => {
    const response = await createPublicContentHandlers(
      () =>
        new PublicContentService({
          async list() {
            throw new Error('database unavailable');
          },
          async findBySlug() {
            throw new Error('database unavailable');
          },
          async findLatestByType() {
            throw new Error('database unavailable');
          },
          async findBriefingByDate() {
            throw new Error('database unavailable');
          },
          async listTopics() {
            throw new Error('database unavailable');
          },
          async findTopicBySlug() {
            throw new Error('database unavailable');
          },
        }),
    ).list(new Request('https://example.com/api/v1/content'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('serves a Beijing-date briefing and rejects future dates', async () => {
    const current = fullItem('briefing');
    const ok = await handlers({ kind: 'content', item: current }).briefing(
      new Request('https://example.com/api/v1/briefings/2026-09-13'),
      '2026-09-13',
    );
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({ type: 'briefing' });

    const future = await handlers().briefing(
      new Request('https://example.com/api/v1/briefings/2999-01-01'),
      '2999-01-01',
    );
    expect(future.status).toBe(404);
  });

  it('returns topic summaries and redirects merged topics', async () => {
    const topic = topicSummary();
    const topicHandlers = createPublicContentHandlers(
      () =>
        new PublicContentService(
          new MemoryRepository(undefined, [topic], {
            kind: 'topic',
            topic,
          }),
        ),
    );
    const list = await topicHandlers.topics(
      new Request('https://example.com/api/v1/topics'),
    );
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual([
      expect.objectContaining({ slug: 'foundation-models', contentCount: 1 }),
    ]);
    const detail = await topicHandlers.topic(
      new Request('https://example.com/api/v1/topics/foundation-models'),
      'foundation-models',
    );
    await expect(detail.json()).resolves.toMatchObject({
      slug: 'foundation-models',
      latestContent: { items: [{ slug: 'test-story' }] },
    });

    const redirect = await createPublicContentHandlers(
      () =>
        new PublicContentService(
          new MemoryRepository(undefined, [], {
            kind: 'redirect',
            location: '/topics/foundation-models',
          }),
        ),
    ).topic(
      new Request('https://example.com/api/v1/topics/old-models'),
      'old-models',
    );
    expect(redirect.status).toBe(301);
  });
});

function handlers(lookup?: PublicContentLookup) {
  return createPublicContentHandlers(
    () => new PublicContentService(new MemoryRepository(lookup)),
  );
}

class MemoryRepository implements PublicContentRepository {
  constructor(
    private readonly lookup?: PublicContentLookup,
    private readonly topics: PublicTopicSummary[] = [],
    private readonly topicLookup: PublicTopicLookup = { kind: 'missing' },
  ) {}

  async list() {
    return { items: [item()], hasMore: false };
  }

  async findBySlug(): Promise<PublicContentLookup> {
    return this.lookup ?? { kind: 'missing' };
  }

  async findLatestByType(): Promise<PublicContentLookup> {
    return this.lookup ?? { kind: 'missing' };
  }

  async findBriefingByDate(): Promise<PublicContentLookup> {
    return this.lookup ?? { kind: 'missing' };
  }

  async listTopics() {
    return this.topics;
  }

  async findTopicBySlug() {
    return this.topicLookup;
  }
}

function fullItem(type: 'news' | 'briefing' | 'analysis') {
  return {
    ...item(),
    type,
    body: { schemaVersion: 1, type: 'doc', content: [] },
    sources: [],
    corrections: [],
  };
}

function topicSummary(): PublicTopicSummary {
  return {
    id: '30000000-0000-4000-8000-000000000003',
    slug: 'foundation-models',
    name: '基础模型',
    description: '追踪基础模型进展。',
    contentCount: 1,
    updatedAt: new Date('2026-09-12T08:00:00Z'),
  };
}

function item(): PublicContentListItem {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    type: 'news',
    slug: 'test-story',
    title: '测试内容',
    dek: '导语',
    summary: '摘要',
    status: 'published',
    verification: 'confirmed',
    importance: 4,
    actionability: 3,
    authorName: '编辑部',
    publishedAt: new Date('2026-09-12T08:00:00Z'),
    updatedAt: new Date('2026-09-12T08:00:00Z'),
    aiDisclosure: null,
    seo: {},
    topics: [],
    sourceCount: 1,
  };
}
