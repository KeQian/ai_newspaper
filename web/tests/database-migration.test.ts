// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { roleSeedStatement } from '@/db/seed';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

const expectedTables = [
  'admin_identities',
  'admin_sessions',
  'admin_user_roles',
  'admin_users',
  'api_rate_limits',
  'audit_logs',
  'automation_job_leases',
  'candidate_entity_suggestions',
  'candidate_event_documents',
  'candidate_event_entities',
  'candidate_events',
  'candidate_generation_failures',
  'candidate_merge_suggestions',
  'content_candidate_events',
  'content_items',
  'content_revisions',
  'content_sources',
  'content_topics',
  'correction_notes',
  'entities',
  'entity_aliases',
  'ingestion_run_documents',
  'ingestion_run_sources',
  'ingestion_runs',
  'newsletter_deliveries',
  'newsletter_email_events',
  'newsletter_issue_contents',
  'newsletter_issues',
  'newsletter_subscribers',
  'newsletter_subscription_requests',
  'outbox_events',
  'raw_documents',
  'roles',
  'search_documents',
  'slug_redirects',
  'source_feeds',
] as const;

describe('PostgreSQL migrations', () => {
  let client: PGlite;

  beforeEach(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
  }, 90_000);

  afterEach(async () => {
    await client.close();
  });

  it('creates every P0 table and can be applied repeatedly', async () => {
    await migrate(drizzle(client), { migrationsFolder });

    const result = await client.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
       order by table_name`,
    );

    expect(result.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );
  }, 60_000);

  it('keeps reference-data seeding idempotent', async () => {
    const database = drizzle(client);
    await database.execute(roleSeedStatement);
    await database.execute(roleSeedStatement);

    const result = await client.query<{ key: string }>(
      'select key from roles order by key',
    );
    expect(result.rows.map(({ key }) => key)).toEqual([
      'admin',
      'chief_editor',
      'editor',
    ]);
  });

  it('enforces raw-document idempotency for external ids and URL hashes', async () => {
    const source = await createSource(client);
    const base = [
      source,
      'https://example.com/news/1',
      'A model ships',
      new Date(),
      'en',
      'hash-1',
    ];

    await client.query(
      `insert into raw_documents
       (source_feed_id, external_id, canonical_url, title, fetched_at, language, content_hash, parser_version)
       values ($1, 'external-1', $2, $3, $4, $5, $6, 'v1')`,
      base,
    );

    await expect(
      client.query(
        `insert into raw_documents
         (source_feed_id, external_id, canonical_url, title, fetched_at, language, content_hash, parser_version)
         values ($1, 'external-1', $2, $3, $4, $5, 'hash-2', 'v1')`,
        base.slice(0, 5),
      ),
    ).rejects.toThrow();

    await client.query(
      `insert into raw_documents
       (source_feed_id, canonical_url, title, fetched_at, language, content_hash, parser_version)
       values ($1, $2, $3, $4, $5, $6, 'v1')`,
      base,
    );
    await expect(
      client.query(
        `insert into raw_documents
         (source_feed_id, canonical_url, title, fetched_at, language, content_hash, parser_version)
         values ($1, $2, $3, $4, $5, $6, 'v1')`,
        base,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid scores and merged candidates without a target', async () => {
    await expect(
      client.query(
        `insert into candidate_events
         (title, fact_summary, status, verification, importance, actionability, novelty, confidence)
         values ('Invalid score', 'Facts', 'new', 'unverified', 6, 3, 3, 0.5)`,
      ),
    ).rejects.toThrow();

    await expect(
      client.query(
        `insert into candidate_events
         (title, fact_summary, status, verification, importance, actionability, novelty, confidence)
         values ('Missing target', 'Facts', 'merged', 'confirmed', 3, 3, 3, 0.8)`,
      ),
    ).rejects.toThrow();
  });

  it('only permits committing a source cursor after success', async () => {
    const source = await createSource(client);
    const run = await client.query<{ id: string }>(
      `insert into ingestion_runs (job_key, idempotency_key, scheduled_at)
       values ('hourly-core', 'run-1', now()) returning id`,
    );

    await expect(
      client.query(
        `insert into ingestion_run_sources (run_id, source_feed_id, status, cursor_after)
         values ($1, $2, 'failed', '{"page":2}')`,
        [run.rows[0].id, source],
      ),
    ).rejects.toThrow();
  });

  it('keeps audit records append-only', async () => {
    const audit = await client.query<{ id: string }>(
      `insert into audit_logs (action, object_type, object_id, request_id)
       values ('system.test', 'test', gen_random_uuid(), 'request-1') returning id`,
    );

    await expect(
      client.query('update audit_logs set action = $1 where id = $2', [
        'system.modified',
        audit.rows[0].id,
      ]),
    ).rejects.toThrow(/append-only/i);
    await expect(
      client.query('delete from audit_logs where id = $1', [audit.rows[0].id]),
    ).rejects.toThrow(/append-only/i);
  });
});

async function createSource(client: PGlite): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into source_feeds
     (key, name, source_type, reliability, url, schedule, parser_key, terms_status, retention_policy, owner)
     values ('example', 'Example', 'rss', 's1', 'https://example.com/feed', '0 * * * *', 'rss-v1', 'approved', 'excerpt', 'editorial')
     returning id`,
  );

  return result.rows[0].id;
}
