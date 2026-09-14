// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleEditorialCandidateRepository } from '@/lib/editorial/candidates/drizzle-repository';
import { CandidateConflictError } from '@/lib/editorial/candidates/model';
import { EditorialCandidateService } from '@/lib/editorial/candidates/service';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const now = new Date('2026-09-12T08:00:00.000Z');
const actorId = '10000000-0000-4000-8000-000000000001';
const sourceId = '20000000-0000-4000-8000-000000000002';
const targetId = '30000000-0000-4000-8000-000000000003';
const draftCandidateId = '40000000-0000-4000-8000-000000000004';
const mergeCandidateId = '50000000-0000-4000-8000-000000000005';
const deferCandidateId = '60000000-0000-4000-8000-000000000006';

describe('editorial candidate repository', () => {
  let client: PGlite;
  let service: EditorialCandidateService;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    service = new EditorialCandidateService(
      new DrizzleEditorialCandidateRepository(database as unknown as Database),
    );
    await seed(client);
  }, 90_000);

  afterEach(async () => client.close());

  it('lists, filters and returns traceable candidate details', async () => {
    const page = await service.list(
      {
        status: 'review',
        source: 'Official',
        includeDeferred: false,
        sort: 'created_desc',
        limit: 2,
      },
      now,
    );
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.items[0]).toMatchObject({
      sourceCount: 1,
      primarySource: 'Official source',
      version: 1,
    });

    const detail = await service.get(draftCandidateId);
    expect(detail).toMatchObject({
      id: draftCandidateId,
      documents: [{ publisher: 'Official source', relation: 'primary' }],
      mergeSuggestions: [{ targetId, status: 'pending' }],
    });
  });

  it('creates only a draft with copied sources, an initial revision and an audit record', async () => {
    const result = await service.decide({
      id: draftCandidateId,
      actorId,
      requestId: 'request-create-draft',
      now,
      decision: { action: 'create_draft', version: 1 },
    });
    expect(result).toMatchObject({
      id: draftCandidateId,
      status: 'review',
      version: 2,
      draftId: expect.any(String),
    });
    const content = await client.query<{
      status: string;
      sources: number;
      revisions: number;
      links: number;
    }>(`select ci.status,
      (select count(*)::int from content_sources where content_id = ci.id) sources,
      (select count(*)::int from content_revisions where content_id = ci.id) revisions,
      (select count(*)::int from content_candidate_events where content_id = ci.id) links
      from content_items ci`);
    expect(content.rows).toEqual([
      { status: 'draft', sources: 1, revisions: 1, links: 1 },
    ]);
    const audit = await client.query<{ action: string; request_id: string }>(
      'select action, request_id from audit_logs',
    );
    expect(audit.rows).toEqual([
      {
        action: 'candidate.create_draft',
        request_id: 'request-create-draft',
      },
    ]);
    await expect(
      service.decide({
        id: draftCandidateId,
        actorId,
        requestId: 'stale-request',
        now,
        decision: { action: 'reject', version: 1, reason: 'stale' },
      }),
    ).rejects.toBeInstanceOf(CandidateConflictError);
  });

  it('merges relations into a target and defers another candidate for 24 hours', async () => {
    await expect(
      service.decide({
        id: mergeCandidateId,
        actorId,
        requestId: 'request-merge',
        now,
        decision: {
          action: 'merge',
          version: 1,
          targetId,
          reason: '同一官方发布',
        },
      }),
    ).resolves.toMatchObject({ status: 'merged', version: 2 });
    const merge = await client.query<{
      status: string;
      merged_into_id: string;
      documents: number;
    }>(
      `select c.status, c.merged_into_id,
      (select count(*)::int from candidate_event_documents where event_id = $1) documents
      from candidate_events c where c.id = $2`,
      [targetId, mergeCandidateId],
    );
    expect(merge.rows[0]).toEqual({
      status: 'merged',
      merged_into_id: targetId,
      documents: 2,
    });

    await expect(
      service.decide({
        id: deferCandidateId,
        actorId,
        requestId: 'request-defer',
        now,
        decision: { action: 'defer', version: 1, reason: '等待更多来源' },
      }),
    ).resolves.toMatchObject({ status: 'review', version: 2 });
    const hidden = await service.list(
      {
        status: 'review',
        includeDeferred: false,
        sort: 'created_desc',
        limit: 20,
      },
      now,
    );
    expect(hidden.items.map(({ id }) => id)).not.toContain(deferCandidateId);
    const visible = await service.list(
      {
        status: 'review',
        includeDeferred: true,
        sort: 'created_desc',
        limit: 20,
      },
      now,
    );
    expect(visible.items.map(({ id }) => id)).toContain(deferCandidateId);
  });
});

async function seed(client: PGlite) {
  await client.query(
    `insert into admin_users (id, email, display_name) values ($1, 'editor@example.com', 'Editor')`,
    [actorId],
  );
  await client.query(
    `insert into source_feeds
      (id, key, name, source_type, reliability, url, schedule, parser_key, terms_status, retention_policy, owner)
     values ($1, 'official', 'Official source', 'api', 's0', 'https://example.com/feed', 'hourly', 'fixture', 'approved', 'excerpt', 'editorial')`,
    [sourceId],
  );
  const candidates = [
    targetId,
    draftCandidateId,
    mergeCandidateId,
    deferCandidateId,
  ];
  for (const [index, id] of candidates.entries()) {
    await client.query(
      `insert into candidate_events
        (id, title, fact_summary, occurred_at, status, verification, importance, actionability, novelty, confidence, created_at, updated_at)
       values ($1, $2, $3, $4, 'review', 'confirmed', $5, 4, 3, 0.9, $6, $6)`,
      [
        id,
        `Candidate ${index}`,
        `Verified fact ${index}`,
        now,
        5 - index,
        new Date(now.getTime() - index * 1000),
      ],
    );
    const documentId = `70000000-0000-4000-8000-00000000000${index}`;
    await client.query(
      `insert into raw_documents
        (id, source_feed_id, external_id, canonical_url, title, allowed_excerpt, published_at, fetched_at, language, content_hash, parser_version)
       values ($1, $2, $3, $4, $5, 'Allowed excerpt', $6, $6, 'zh-CN', $7, 'fixture')`,
      [
        documentId,
        sourceId,
        `document-${index}`,
        `https://example.com/${index}`,
        `Source ${index}`,
        now,
        String(index).repeat(64),
      ],
    );
    await client.query(
      `insert into candidate_event_documents
        (event_id, raw_document_id, raw_content_hash, relation)
       values ($1, $2, $3, 'primary')`,
      [id, documentId, String(index).repeat(64)],
    );
  }
  await client.query(
    `insert into candidate_merge_suggestions
      (candidate_id, target_event_id, method, score, reasons, status)
     values ($1, $2, 'rules_v1', 0.91, array['标题接近'], 'pending'),
            ($3, $2, 'rules_v1', 0.88, array['共享来源'], 'pending')`,
    [draftCandidateId, targetId, mergeCandidateId],
  );
}
