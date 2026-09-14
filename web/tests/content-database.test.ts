// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleContentRepository } from '@/lib/content/drizzle-repository';
import {
  ContentConflictError,
  type ContentDraftInput,
} from '@/lib/content/model';
import { ContentService } from '@/lib/content/service';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const now = new Date('2026-09-12T08:00:00.000Z');
const actorId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000002';
const documentId = '30000000-0000-4000-8000-000000000003';
const topicId = '40000000-0000-4000-8000-000000000004';

describe('content repository workflow', () => {
  let client: PGlite;
  let service: ContentService;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    service = new ContentService(
      new DrizzleContentRepository(database as unknown as Database),
    );
    await seed(client);
  }, 90_000);

  afterEach(async () => client.close());

  it('preserves immutable revisions and rejects stale saves', async () => {
    const created = await service.create(draft(), actorId, 'create', now);
    expect(created).toMatchObject({ status: 'draft', version: 1 });
    const updated = await service.update(
      created.id,
      {
        ...draft(),
        title: '更新后的标题',
        changeSummary: '更新标题',
        version: 1,
      },
      actorId,
      'update',
      now,
    );
    expect(updated).toMatchObject({ status: 'draft', version: 2 });
    await expect(
      service.update(
        created.id,
        { ...draft(), version: 1 },
        actorId,
        'stale',
        now,
      ),
    ).rejects.toBeInstanceOf(ContentConflictError);

    const rows = await client.query<{ revision: number; title: string }>(
      `select revision, snapshot->>'title' title from content_revisions order by revision`,
    );
    expect(rows.rows).toEqual([
      { revision: 1, title: 'OpenAI 发布新模型' },
      { revision: 2, title: '更新后的标题' },
    ]);
  });

  it('supports review, scheduling, publishing, correction and withdrawal with audit/outbox records', async () => {
    const created = await service.create(draft(), actorId, 'create', now);
    await expect(
      service.transition(
        created.id,
        { type: 'submit_review', version: 1 },
        actorId,
        'review',
        now,
      ),
    ).resolves.toMatchObject({ status: 'in_review' });
    await expect(
      service.transition(
        created.id,
        {
          type: 'publish',
          version: 1,
          scheduledAt: new Date('2026-09-13T08:00:00Z'),
        },
        actorId,
        'schedule',
        now,
      ),
    ).resolves.toMatchObject({ status: 'scheduled' });
    await expect(
      service.transition(
        created.id,
        { type: 'cancel_schedule', version: 1 },
        actorId,
        'cancel',
        now,
      ),
    ).resolves.toMatchObject({ status: 'in_review' });
    await expect(
      service.transition(
        created.id,
        { type: 'publish', version: 1 },
        actorId,
        'publish',
        now,
      ),
    ).resolves.toMatchObject({ status: 'published' });
    await expect(
      client.query<{ title: string }>(
        'select title from search_documents where content_id = $1',
        [created.id],
      ),
    ).resolves.toMatchObject({
      rows: [{ title: 'OpenAI 发布新模型' }],
    });
    await expect(
      service.correct(
        created.id,
        {
          ...draft(),
          title: '更正后的标题',
          changeSummary: '事实更正',
          correctionDescription: '修正模型发布日期。',
          version: 1,
        },
        actorId,
        'correct',
        now,
      ),
    ).resolves.toMatchObject({ status: 'updated', version: 2 });
    await expect(
      client.query<{ title: string }>(
        'select title from search_documents where content_id = $1',
        [created.id],
      ),
    ).resolves.toMatchObject({ rows: [{ title: '更正后的标题' }] });
    await expect(
      service.transition(
        created.id,
        { type: 'withdraw', version: 2, reason: '来源撤销原始信息' },
        actorId,
        'withdraw',
        now,
      ),
    ).resolves.toMatchObject({ status: 'withdrawn' });
    await expect(
      client.query('select 1 from search_documents where content_id = $1', [
        created.id,
      ]),
    ).resolves.toMatchObject({ rows: [] });

    const state = await client.query<{
      status: string;
      withdrawal_reason: string;
      revisions: number;
      corrections: number;
      outbox: number;
    }>(
      `select status, withdrawal_reason,
      (select count(*)::int from content_revisions where content_id = content_items.id) revisions,
      (select count(*)::int from correction_notes where content_id = content_items.id) corrections,
      (select count(*)::int from outbox_events) outbox
      from content_items where id = $1`,
      [created.id],
    );
    expect(state.rows[0]).toEqual({
      status: 'withdrawn',
      withdrawal_reason: '来源撤销原始信息',
      revisions: 2,
      corrections: 1,
      outbox: 3,
    });
    const audits = await client.query<{ action: string }>(
      'select action from audit_logs order by created_at, action',
    );
    expect(audits.rows.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'content.create',
        'content.submit_review',
        'content.publish',
        'content.correct',
        'content.withdraw',
      ]),
    );
  });

  it('blocks publication when the preflight topic requirement is not met', async () => {
    const created = await service.create(
      { ...draft(), topicIds: [] },
      actorId,
      'create-no-topic',
      now,
    );
    await service.transition(
      created.id,
      { type: 'submit_review', version: 1 },
      actorId,
      'review-no-topic',
      now,
    );
    await expect(
      service.transition(
        created.id,
        { type: 'publish', version: 1 },
        actorId,
        'publish-no-topic',
        now,
      ),
    ).rejects.toMatchObject({
      issues: ['至少需要一个主题'],
    });
  });
});

function draft(): ContentDraftInput {
  return {
    type: 'news',
    title: 'OpenAI 发布新模型',
    dek: '面向开发者的新能力',
    summary: '官方发布了新的模型能力。',
    body: {
      schemaVersion: 1,
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '正文。' }] },
      ],
    },
    verification: 'confirmed',
    importance: 4,
    actionability: 4,
    sourceIds: [documentId],
    topicIds: [topicId],
    seo: {
      title: 'OpenAI 发布新模型',
      description: '了解官方发布的新模型能力。',
    },
    aiDisclosure: { assisted: true, note: 'AI 用于初稿整理，已由编辑核验。' },
    changeSummary: '创建首版',
  };
}

async function seed(client: PGlite) {
  await client.query(
    `insert into admin_users (id, email, display_name) values ($1, 'chief@example.com', 'Chief Editor')`,
    [actorId],
  );
  await client.query(
    `insert into source_feeds (id, key, name, source_type, reliability, url, schedule, parser_key, terms_status, retention_policy, owner)
    values ($1, 'official', 'Official source', 'api', 's0', 'https://example.com/feed', 'hourly', 'fixture', 'approved', 'excerpt', 'editorial')`,
    [sourceId],
  );
  await client.query(
    `insert into raw_documents (id, source_feed_id, external_id, canonical_url, title, allowed_excerpt, published_at, fetched_at, language, content_hash, parser_version)
    values ($1, $2, 'release-1', 'https://example.com/release', 'Official release', 'Excerpt', $3, $3, 'zh-CN', $4, 'fixture')`,
    [documentId, sourceId, now, 'a'.repeat(64)],
  );
  await client.query(
    `insert into entities (id, entity_type, slug, canonical_name, name_zh) values ($1, 'topic', 'foundation-models', 'Foundation Models', '基础模型')`,
    [topicId],
  );
}
