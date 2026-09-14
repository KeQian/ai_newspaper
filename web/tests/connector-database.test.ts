// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { BatchConnectorRunner } from '@/lib/ingestion/connectors/batch-runner';
import { DrizzleConnectorRepository } from '@/lib/ingestion/connectors/drizzle-connector-repository';
import {
  GitHubReleaseConnectorRunner,
  SourceConnectorRunner,
} from '@/lib/ingestion/connectors/runner';
import type {
  ArchiveInput,
  RawArchiveStore,
} from '@/lib/ingestion/connectors/types';
import { DrizzleIngestionRepository } from '@/lib/ingestion/drizzle-repository';
import { IngestionRunService } from '@/lib/ingestion/run-service';
import { SourceRegistryService } from '@/lib/ingestion/source-service';

const sourceKey = 'github-openai-python-releases';
const firstRunAt = new Date('2026-09-12T01:00:00.000Z');

describe('database-backed GitHub Releases connector', () => {
  let client: PGlite;
  let database: Database;
  let runService: IngestionRunService;
  let connectorRepository: DrizzleConnectorRepository;
  let fixture: string;

  beforeAll(async () => {
    client = new PGlite();
    const pgliteDatabase = drizzle(client);
    await migrate(pgliteDatabase, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    database = pgliteDatabase as unknown as Database;
    const ingestionRepository = new DrizzleIngestionRepository(database);
    const registryYaml = await readFile(
      path.resolve(process.cwd(), '../docs/07_SOURCE_REGISTRY.yaml'),
      'utf8',
    );
    await new SourceRegistryService(ingestionRepository).importYaml(
      registryYaml,
      'connector-registry-import',
      firstRunAt,
    );
    await client.query(
      `update source_feeds
       set config = jsonb_set(config, '{fetchPolicy,userAgent}', '"AI-Signal-Research/0.1 (+editor@example.com)"')
       where key = $1`,
      [sourceKey],
    );
    runService = new IngestionRunService(ingestionRepository);
    connectorRepository = new DrizzleConnectorRepository(database);
    fixture = await readFile(
      path.resolve(process.cwd(), 'tests/fixtures/github-releases.json'),
      'utf8',
    );
  }, 90_000);

  afterAll(async () => {
    await client.close();
  });

  it('persists archived documents, commits the cursor, and deduplicates replayed releases', async () => {
    const firstRun = await createRun('2026-09-12T01:00:00.000Z');
    const firstArchive = new MemoryArchiveStore();
    const firstRunner = runnerWithResponse(
      firstArchive,
      new Response(fixture, {
        status: 200,
        headers: { etag: '"etag-1"', 'content-type': 'application/json' },
      }),
    );
    await expect(
      firstRunner.run({
        runId: firstRun,
        sourceKey,
        requestId: 'request-success-1',
        now: firstRunAt,
      }),
    ).resolves.toEqual({ fetchedCount: 2, newCount: 2, duplicateCount: 0 });

    const documents = await client.query<{
      external_id: string;
      raw_object_key: string;
    }>(
      'select external_id, raw_object_key from raw_documents order by external_id',
    );
    expect(documents.rows).toHaveLength(2);
    expect(documents.rows[0].raw_object_key).toBe(firstArchive.entries[0].key);
    const firstObservations = await client.query<{
      disposition: string;
      observed_content_hash: string;
    }>(
      `select disposition, observed_content_hash
       from ingestion_run_documents
       where run_id = $1`,
      [firstRun],
    );
    expect(firstObservations.rows).toHaveLength(2);
    expect(
      firstObservations.rows.every(({ disposition }) => disposition === 'new'),
    ).toBe(true);

    const firstState = await readState(firstRun);
    expect(firstState).toMatchObject({
      run_status: 'succeeded',
      source_status: 'succeeded',
      fetched_count: 2,
      new_count: 2,
      duplicate_count: 0,
      archive_object_key: firstArchive.entries[0].key,
      source_cursor: { etag: '"etag-1"' },
    });

    const secondRun = await createRun('2026-09-12T02:00:00.000Z');
    const secondRunner = runnerWithResponse(
      new MemoryArchiveStore(),
      new Response(fixture, {
        status: 200,
        headers: { etag: '"etag-2"', 'content-type': 'application/json' },
      }),
    );
    await expect(
      secondRunner.run({
        runId: secondRun,
        sourceKey,
        requestId: 'request-success-2',
        now: new Date('2026-09-12T02:00:00.000Z'),
      }),
    ).resolves.toEqual({ fetchedCount: 2, newCount: 0, duplicateCount: 2 });

    const repeatedCount = await client.query<{ count: number }>(
      'select count(*)::int as count from raw_documents',
    );
    expect(repeatedCount.rows[0].count).toBe(2);
    const repeatedObservations = await client.query<{ disposition: string }>(
      `select disposition from ingestion_run_documents where run_id = $1`,
      [secondRun],
    );
    expect(repeatedObservations.rows).toHaveLength(2);
    expect(
      repeatedObservations.rows.every(
        ({ disposition }) => disposition === 'duplicate',
      ),
    ).toBe(true);
    expect(await readState(secondRun)).toMatchObject({
      run_status: 'succeeded',
      fetched_count: 2,
      new_count: 0,
      duplicate_count: 2,
      source_cursor: { etag: '"etag-2"' },
    });
  });

  it('records authorization failure, preserves the cursor, and disables the source with audit', async () => {
    const runId = await createRun('2026-09-12T03:00:00.000Z');
    const runner = runnerWithResponse(
      new MemoryArchiveStore(),
      new Response('denied', { status: 401 }),
    );
    await expect(
      runner.run({
        runId,
        sourceKey,
        requestId: 'request-auth-failure',
        now: new Date('2026-09-12T03:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_FAILED' });

    expect(await readState(runId)).toMatchObject({
      run_status: 'failed',
      source_status: 'failed',
      error_code: 'AUTHORIZATION_FAILED',
      source_enabled: false,
      source_failure_count: 1,
      source_cursor: { etag: '"etag-2"' },
    });
    const audit = await client.query<{ count: number }>(
      `select count(*)::int as count from audit_logs
       where action = 'source.auto_disabled.authorization'
       and request_id = 'request-auth-failure'`,
    );
    expect(audit.rows[0].count).toBe(1);
  });

  it('isolates a failed source and recovers only unfinished sources on batch replay', async () => {
    const nodeSourceKey = 'github-openai-node-releases';
    await client.query(
      `update source_feeds
       set enabled = true,
           terms_status = 'approved',
           config = jsonb_set(config, '{fetchPolicy,userAgent}', '"AI-Signal-Research/0.1 (+editor@example.com)"')
       where key = any($1)`,
      [[sourceKey, nodeSourceKey]],
    );
    const runId = await createRun('2026-09-12T04:00:00.000Z', [
      sourceKey,
      nodeSourceKey,
    ]);
    const firstRunner = new SourceConnectorRunner(
      connectorRepository,
      new MemoryArchiveStore(),
      {
        fetcher: async (url) =>
          new Request(url).url.includes('/openai-node/')
            ? new Response('temporary', { status: 503 })
            : new Response(fixture, {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
        sleep: async () => {},
        getCredential: () => 'test-github-token',
      },
    );
    const first = await new BatchConnectorRunner(
      connectorRepository,
      firstRunner,
    ).run({
      runId,
      requestId: 'request-batch-partial',
      now: () => new Date('2026-09-12T04:00:00.000Z'),
    });

    expect(first).toMatchObject({ succeeded: 1, failed: 1, skipped: 0 });
    expect((await readState(runId)).run_status).toBe('partial');

    const nodeFixture = fixture.replaceAll(
      'openai/openai-python',
      'openai/openai-node',
    );
    const recoveryRunner = new SourceConnectorRunner(
      connectorRepository,
      new MemoryArchiveStore(),
      {
        fetcher: async () =>
          new Response(nodeFixture, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        getCredential: () => 'test-github-token',
      },
    );
    const recovered = await new BatchConnectorRunner(
      connectorRepository,
      recoveryRunner,
    ).run({
      runId,
      requestId: 'request-batch-recovery',
      now: () => new Date('2026-09-12T04:05:00.000Z'),
    });

    expect(recovered).toMatchObject({ succeeded: 1, failed: 0, skipped: 1 });
    expect((await readState(runId)).run_status).toBe('succeeded');
    const sourceStates = await client.query<{ key: string; status: string }>(
      `select s.key, rs.status
       from ingestion_run_sources rs
       join source_feeds s on s.id = rs.source_feed_id
       where rs.run_id = $1
       order by s.key`,
      [runId],
    );
    expect(sourceStates.rows).toEqual([
      { key: nodeSourceKey, status: 'succeeded' },
      { key: sourceKey, status: 'succeeded' },
    ]);
  });

  async function createRun(
    scheduledAt: string,
    sources = [sourceKey],
  ): Promise<string> {
    const input = {
      jobKey: 'developer-ecosystem-radar',
      scheduledAt,
      sources,
    };
    const key = await runService.expectedIdempotencyKey(input);
    return (await runService.createOrResume(input, key, new Date(scheduledAt)))
      .run.id;
  }

  function runnerWithResponse(archive: RawArchiveStore, response: Response) {
    return new GitHubReleaseConnectorRunner(connectorRepository, archive, {
      fetcher: async () => response,
      getCredential: () => 'test-github-token',
    });
  }

  async function readState(runId: string) {
    const result = await client.query<{
      run_status: string;
      source_status: string;
      fetched_count: number;
      new_count: number;
      duplicate_count: number;
      archive_object_key: string | null;
      error_code: string | null;
      source_cursor: Record<string, unknown>;
      source_enabled: boolean;
      source_failure_count: number;
    }>(
      `select r.status as run_status,
              rs.status as source_status,
              r.fetched_count,
              r.new_count,
              r.duplicate_count,
              rs.archive_object_key,
              rs.error_code,
              s.cursor as source_cursor,
              s.enabled as source_enabled,
              s.failure_count as source_failure_count
       from ingestion_runs r
       join ingestion_run_sources rs on rs.run_id = r.id
       join source_feeds s on s.id = rs.source_feed_id
       where r.id = $1`,
      [runId],
    );
    return result.rows[0];
  }
});

class MemoryArchiveStore implements RawArchiveStore {
  entries: ArchiveInput[] = [];

  async put(input: ArchiveInput): Promise<void> {
    this.entries.push(input);
  }
}
