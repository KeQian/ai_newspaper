// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleSearchRepository } from '@/lib/search/drizzle-repository';
import { searchQuerySchema } from '@/lib/search/model';
import { PostgresSearchRateLimiter } from '@/lib/search/rate-limit';
import { SearchService } from '@/lib/search/service';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const actorId = '10000000-0000-4000-8000-000000000001';
const topicId = '20000000-0000-4000-8000-000000000002';
const firstId = '30000000-0000-4000-8000-000000000003';
const secondId = '40000000-0000-4000-8000-000000000004';
const withdrawnId = '50000000-0000-4000-8000-000000000005';

describe('search repository', () => {
  let client: PGlite;
  let service: SearchService;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    service = new SearchService(
      new DrizzleSearchRepository(database as unknown as Database),
    );
    await seed(client);
  }, 90_000);

  afterEach(async () => client.close());

  it('finds Chinese body text and English aliases', async () => {
    const chinese = await service.search(
      searchQuerySchema.parse({ q: '推理能力', limit: 20 }),
    );
    expect(chinese.items).toHaveLength(1);
    expect(chinese.items[0]).toMatchObject({
      id: firstId,
      matchField: 'body',
    });

    const alias = await service.search(
      searchQuerySchema.parse({ q: 'GPT', limit: 20 }),
    );
    expect(alias.items.map(({ id }) => id)).toContain(firstId);
    expect(alias.topics[0]).toMatchObject({ slug: 'foundation-models' });
  });

  it('paginates deterministically and never returns withdrawn projections', async () => {
    const first = await service.search(
      searchQuerySchema.parse({ q: '模型', sort: 'latest', limit: 1 }),
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.search(
      searchQuerySchema.parse({
        q: '模型',
        sort: 'latest',
        limit: 1,
        cursor: first.nextCursor!,
      }),
    );
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect([first.items[0].id, second.items[0].id]).not.toContain(withdrawnId);
  });

  it('enforces a shared atomic rate limit per fixed database window', async () => {
    const limiter = new PostgresSearchRateLimiter(
      drizzle(client) as unknown as Database,
      1,
      60_000,
    );
    const keyHash = '0123456789abcdef0123456789abcdef';

    await expect(
      limiter.consume(keyHash, new Date('2026-09-13T12:00:10Z')),
    ).resolves.toEqual({ allowed: true, retryAfter: 50 });
    await expect(
      limiter.consume(keyHash, new Date('2026-09-13T12:00:11Z')),
    ).resolves.toEqual({ allowed: false, retryAfter: 49 });
    await expect(
      limiter.consume(keyHash, new Date('2026-09-13T12:01:00Z')),
    ).resolves.toEqual({ allowed: true, retryAfter: 60 });

    const stored = await client.query<{
      key_hash: string;
      count: number;
    }>('select key_hash, count from api_rate_limits order by window_start');
    expect(stored.rows).toEqual([
      { key_hash: keyHash, count: 2 },
      { key_hash: keyHash, count: 1 },
    ]);
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
    `insert into entity_aliases (entity_id, alias, normalized_alias, language)
     values ($1, 'GPT', 'gpt', 'en')`,
    [topicId],
  );
  const body = JSON.stringify({ schemaVersion: 1, type: 'doc', content: [] });
  await client.query(
    `insert into content_items
      (id, content_type, slug, status, verification, title, dek, summary, body, importance, actionability, published_at, withdrawal_reason, author_id, ai_disclosure, seo)
     values
      ($1, 'analysis', 'reasoning-model', 'published', 'confirmed', '新模型发布', '', '能力更新', $5, 4, 4, '2026-09-12T08:00:00Z', null, $4, '{}', '{}'),
      ($2, 'news', 'model-update', 'updated', 'confirmed', '模型更新', '', '产品调整', $5, 3, 3, '2026-09-12T08:00:00Z', null, $4, '{}', '{}'),
      ($3, 'news', 'withdrawn-model', 'withdrawn', 'confirmed', '撤回模型', '', '不应出现', $5, 5, 5, '2026-09-13T08:00:00Z', '已撤回', $4, '{}', '{}')`,
    [firstId, secondId, withdrawnId, actorId, body],
  );
  await client.query(
    `insert into content_topics (content_id, entity_id) values ($1, $3), ($2, $3)`,
    [firstId, secondId, topicId],
  );
  await client.query(
    `insert into search_documents
      (content_id, content_type, title, summary, body_text, entity_text, search_text, published_at)
     values
      ($1, 'analysis', '新模型发布', '能力更新', '推理能力明显提升', 'Foundation Models 基础模型 GPT', '新模型发布 能力更新 推理能力明显提升 Foundation Models 基础模型 GPT', '2026-09-12T08:00:00Z'),
      ($2, 'news', '模型更新', '产品调整', '定价变化', '基础模型', '模型更新 产品调整 定价变化 基础模型', '2026-09-12T08:00:00Z'),
      ($3, 'news', '撤回模型', '不应出现', '敏感正文', '', '撤回模型 不应出现 敏感正文', '2026-09-13T08:00:00Z')`,
    [firstId, secondId, withdrawnId],
  );
}
