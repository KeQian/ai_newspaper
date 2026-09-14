// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzlePublicContentRepository } from '@/lib/public-content/drizzle-repository';
import { PublicContentValidationError } from '@/lib/public-content/model';
import { PublicContentService } from '@/lib/public-content/service';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const actorId = '10000000-0000-4000-8000-000000000001';
const topicId = '20000000-0000-4000-8000-000000000002';
const publishedId = '30000000-0000-4000-8000-000000000003';
const updatedId = '40000000-0000-4000-8000-000000000004';
const draftId = '50000000-0000-4000-8000-000000000005';
const withdrawnId = '60000000-0000-4000-8000-000000000006';
const briefingId = '70000000-0000-4000-8000-000000000007';
const oldTopicId = '80000000-0000-4000-8000-000000000008';

describe('public content repository', () => {
  let client: PGlite;
  let service: PublicContentService;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    service = new PublicContentService(
      new DrizzlePublicContentRepository(database as unknown as Database),
    );
    await seed(client);
  }, 90_000);

  afterEach(async () => client.close());

  it('lists only public content and applies topic filters with stable cursors', async () => {
    const first = await service.list({ limit: 1, type: 'news' });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      id: updatedId,
      status: 'updated',
      sourceCount: 1,
      topics: [{ slug: 'foundation-models', name: '基础模型' }],
    });
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await service.list({
      limit: 1,
      type: 'news',
      cursor: first.nextCursor!,
    });
    expect(second.items.map(({ id }) => id)).toEqual([publishedId]);
    expect(second.nextCursor).toBeNull();

    const filtered = await service.list({
      limit: 20,
      topic: 'foundation-models',
      verification: 'confirmed',
      importanceMin: 4,
    });
    expect(filtered.items.map(({ id }) => id)).toEqual([updatedId]);
    expect(filtered.items.map(({ id }) => id)).not.toContain(draftId);
    expect(filtered.items.map(({ id }) => id)).not.toContain(withdrawnId);
  });

  it('returns evidence and corrections while isolating withdrawn article data', async () => {
    const article = await service.findBySlug('updated-story');
    expect(article).toMatchObject({
      kind: 'content',
      item: {
        sources: [{ publisher: 'OpenAI', relation: 'primary' }],
        corrections: [{ description: '更正了发布时间。' }],
      },
    });

    const withdrawn = await service.findBySlug('withdrawn-story');
    expect(withdrawn).toMatchObject({
      kind: 'content',
      item: {
        status: 'withdrawn',
        summary: '原始来源撤回了声明。',
        dek: '',
        sources: [],
        body: { schemaVersion: 1, type: 'doc', content: [] },
      },
    });
  });

  it('resolves historical slugs and rejects malformed cursors', async () => {
    await expect(service.findBySlug('old-story')).resolves.toEqual({
      kind: 'redirect',
      location: '/news/updated-story',
    });
    await expect(
      service.list({ limit: 20, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(PublicContentValidationError);
  });

  it('resolves Beijing-date briefings and public topic catalogs', async () => {
    const briefing = await service.findBriefingByDate('2026-09-13');
    expect(briefing).toMatchObject({
      kind: 'content',
      item: { id: briefingId, type: 'briefing' },
    });
    await expect(service.findBriefingByDate('2026-09-12')).resolves.toEqual({
      kind: 'missing',
    });

    const topics = await service.listTopics();
    expect(topics[0]).toMatchObject({
      id: topicId,
      contentCount: 2,
      name: '基础模型',
    });
    const topic = await service.findTopicBySlug('foundation-models');
    expect(topic).toMatchObject({
      kind: 'topic',
      topic: { id: topicId },
      content: { items: expect.any(Array) },
    });
    await expect(service.findTopicBySlug('old-models')).resolves.toEqual({
      kind: 'redirect',
      location: '/topics/foundation-models',
    });
  });

  it('filters by source publisher and publication range', async () => {
    const filtered = await service.list({
      limit: 20,
      source: 'OpenAI',
      from: new Date('2026-09-12T07:00:00Z'),
      to: new Date('2026-09-12T09:00:00Z'),
    });
    expect(filtered.items.map(({ id }) => id)).toEqual([updatedId]);
  });
});

async function seed(client: PGlite) {
  await client.query(
    `insert into admin_users (id, email, display_name) values ($1, 'editor@example.com', '编辑部')`,
    [actorId],
  );
  await client.query(
    `insert into entities (id, entity_type, slug, canonical_name, name_zh)
     values ($1, 'topic', 'foundation-models', 'Foundation Models', '基础模型')`,
    [topicId],
  );
  await client.query(
    `insert into entities (id, entity_type, slug, canonical_name, status, merged_into_id)
     values ($1, 'topic', 'old-models', 'Old Models', 'deprecated', $2)`,
    [oldTopicId, topicId],
  );
  await client.query(
    `insert into content_items
      (id, content_type, slug, status, verification, title, dek, summary, body, importance, actionability, published_at, withdrawal_reason, author_id, ai_disclosure, seo)
     values
      ($1, 'news', 'published-story', 'published', 'developing', '已发布内容', '导语', '摘要', $5, 3, 2, '2026-09-12T06:00:00Z', null, $4, '{}', '{}'),
      ($2, 'news', 'updated-story', 'updated', 'confirmed', '已更新内容', '导语', '摘要', $5, 5, 4, '2026-09-12T08:00:00Z', null, $4, '{"assisted":true}', '{}'),
      ($3, 'news', 'draft-story', 'draft', 'confirmed', '草稿内容', '导语', '摘要', $5, 5, 5, null, null, $4, '{}', '{}'),
      ($6, 'news', 'withdrawn-story', 'withdrawn', 'confirmed', '撤回内容', '不得泄露的导语', '不得泄露的摘要', $5, 5, 5, '2026-09-11T08:00:00Z', '原始来源撤回了声明。', $4, '{}', '{}'),
      ($7, 'briefing', 'daily-briefing', 'published', 'confirmed', '今日 AI 简报', '导语', '摘要', $5, 4, 4, '2026-09-12T16:30:00Z', null, $4, '{}', '{}')`,
    [
      publishedId,
      updatedId,
      draftId,
      actorId,
      JSON.stringify({
        schemaVersion: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
        ],
      }),
      withdrawnId,
      briefingId,
    ],
  );
  await client.query(
    `insert into content_topics (content_id, entity_id) values ($1, $3), ($2, $3), ($4, $3)`,
    [publishedId, updatedId, topicId, withdrawnId],
  );
  await client.query(
    `insert into content_sources
      (content_id, url, title, publisher, source_type, reliability, published_at, accessed_at, relation)
     values ($1, 'https://openai.com/example', '官方公告', 'OpenAI', 'web', 's0', '2026-09-12T07:00:00Z', '2026-09-12T08:00:00Z', 'primary')`,
    [updatedId],
  );
  await client.query(
    `insert into correction_notes (content_id, description, corrected_at, created_by)
     values ($1, '更正了发布时间。', '2026-09-12T09:00:00Z', $2)`,
    [updatedId, actorId],
  );
  await client.query(
    `insert into slug_redirects (old_path, new_path, reason)
     values ('/news/old-story', '/news/updated-story', '标题更新')`,
  );
}
