// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleSearchRepository } from '@/lib/search/drizzle-repository';
import { searchQuerySchema } from '@/lib/search/model';
import { SearchService } from '@/lib/search/service';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

describe('search baseline performance', () => {
  let client: PGlite;
  let service: SearchService;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    await client.exec(`
      insert into admin_users (id, email, display_name)
      values ('10000000-0000-4000-8000-000000000001', 'perf@example.com', '性能测试');

      insert into content_items
        (id, content_type, slug, status, verification, title, dek, summary, body,
         importance, actionability, published_at, author_id, ai_disclosure, seo)
      select
        md5('search-performance-' || value)::uuid,
        case when value % 5 = 0 then 'analysis'::content_type else 'news'::content_type end,
        'search-performance-' || value,
        'published'::content_status,
        'confirmed'::verification,
        'AI 性能基准动态 ' || value,
        '',
        '用于公开检索的性能关键字与摘要',
        '{"schemaVersion":1,"type":"doc","content":[]}'::jsonb,
        3,
        3,
        timestamptz '2026-09-13 00:00:00+00' - value * interval '1 second',
        '10000000-0000-4000-8000-000000000001',
        '{}'::jsonb,
        '{}'::jsonb
      from generate_series(1, 10000) as rows(value);

      insert into search_documents
        (content_id, content_type, title, summary, body_text, entity_text,
         search_text, published_at)
      select
        id,
        content_type,
        title,
        summary,
        '正文包含性能关键字和模型更新',
        '',
        concat_ws(' ', title, summary, '正文包含性能关键字和模型更新'),
        published_at
      from content_items;
    `);
    service = new SearchService(
      new DrizzleSearchRepository(database as unknown as Database),
    );
  }, 90_000);

  afterAll(async () => client.close());

  it('keeps warmed 10k-document query p95 within the public API budget', async () => {
    const query = searchQuerySchema.parse({
      q: '性能关键字',
      sort: 'relevance',
      limit: 20,
    });
    await service.search(query);

    const samples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      const result = await service.search(query);
      samples.push(performance.now() - startedAt);
      expect(result.items).toHaveLength(20);
      expect(result.totalApprox).toBe(10_000);
    }

    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    expect(p95).toBeLessThanOrEqual(800);
  }, 90_000);
});
