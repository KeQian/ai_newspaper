// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleAutomationRepository } from '@/lib/automation/drizzle-repository';
import { automationJobs } from '@/lib/automation/model';

describe('database-backed automation leases and recovery', () => {
  let client: PGlite;
  let repository: DrizzleAutomationRepository;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    repository = new DrizzleAutomationRepository(
      database as unknown as Database,
    );
  }, 90_000);

  afterAll(async () => {
    await client.close();
  });

  it('allows one holder and permits takeover only after expiry', async () => {
    const now = new Date('2026-09-13T03:00:00.000Z');
    await expect(
      repository.acquireLease({
        jobKey: 'developer-ecosystem-radar',
        holderId: 'holder-a',
        now,
        expiresAt: new Date('2026-09-13T03:30:00.000Z'),
      }),
    ).resolves.toBe(true);
    await expect(
      repository.acquireLease({
        jobKey: 'developer-ecosystem-radar',
        holderId: 'holder-b',
        now: new Date('2026-09-13T03:10:00.000Z'),
        expiresAt: new Date('2026-09-13T03:40:00.000Z'),
      }),
    ).resolves.toBe(false);
    await expect(
      repository.acquireLease({
        jobKey: 'developer-ecosystem-radar',
        holderId: 'holder-b',
        now: new Date('2026-09-13T03:31:00.000Z'),
        expiresAt: new Date('2026-09-13T04:01:00.000Z'),
      }),
    ).resolves.toBe(true);
  });

  it('recovers stale source work, aggregates the run, and never advances its cursor', async () => {
    const source = await client.query<{ id: string }>(
      `insert into source_feeds
       (key, name, source_type, reliability, url, enabled, schedule, parser_key,
        terms_status, retention_policy, owner, config, updated_at)
       values ('source-a', 'Source A', 'github', 's0', 'https://api.github.com/repos/example/example/releases',
        true, 'hourly', 'github_releases_v1', 'approved', 'excerpt', 'editorial',
        '{"category":"developer_ecosystem"}', '2026-09-13T01:00:00Z') returning id`,
    );
    const run = await client.query<{ id: string }>(
      `insert into ingestion_runs
       (job_key, idempotency_key, status, scheduled_at, started_at, updated_at)
       values ('developer-ecosystem-radar', 'stale-run', 'running',
        '2026-09-13T01:00:00Z', '2026-09-13T01:00:00Z', '2026-09-13T01:00:00Z') returning id`,
    );
    await client.query(
      `insert into ingestion_run_sources
       (run_id, source_feed_id, status, cursor_before, updated_at)
       values ($1, $2, 'running', '{"page":1}', '2026-09-13T01:00:00Z')`,
      [run.rows[0].id, source.rows[0].id],
    );

    await expect(
      repository.recoverStaleSources(
        new Date('2026-09-13T02:30:00.000Z'),
        new Date('2026-09-13T03:00:00.000Z'),
      ),
    ).resolves.toBe(1);
    const state = await client.query<{
      run_status: string;
      source_status: string;
      error_code: string;
      cursor_after: unknown;
    }>(
      `select r.status as run_status, s.status as source_status,
              s.error_code, s.cursor_after
       from ingestion_runs r
       join ingestion_run_sources s on s.run_id = r.id
       where r.id = $1`,
      [run.rows[0].id],
    );
    expect(state.rows[0]).toMatchObject({
      run_status: 'failed',
      source_status: 'failed',
      error_code: 'SOURCE_LEASE_EXPIRED',
      cursor_after: null,
    });

    await expect(
      repository.listEligibleSources(
        automationJobs['developer-ecosystem-radar'],
      ),
    ).resolves.toEqual([{ key: 'source-a', schedule: 'hourly' }]);
    await expect(
      repository.latestScheduledAt('developer-ecosystem-radar'),
    ).resolves.toEqual(new Date('2026-09-13T01:00:00.000Z'));
  });
});
