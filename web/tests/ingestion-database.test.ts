// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleIngestionRepository } from '@/lib/ingestion/drizzle-repository';
import { IngestionValidationError } from '@/lib/ingestion/model';
import { IngestionRunService } from '@/lib/ingestion/run-service';
import { SourceRegistryService } from '@/lib/ingestion/source-service';

const now = new Date('2026-09-11T08:00:00.000Z');

describe('database-backed source registry and run creation', () => {
  let client: PGlite;
  let repository: DrizzleIngestionRepository;
  let registryYaml: string;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    repository = new DrizzleIngestionRepository(
      database as unknown as Database,
    );
    registryYaml = await readFile(
      path.resolve(process.cwd(), '../docs/07_SOURCE_REGISTRY.yaml'),
      'utf8',
    );
  }, 90_000);

  afterAll(async () => {
    await client.close();
  });

  it('imports the registry idempotently and audits only material changes', async () => {
    const service = new SourceRegistryService(repository);
    await expect(
      service.importYaml(registryYaml, 'registry-import-1', now),
    ).resolves.toEqual({ created: 20, updated: 0, unchanged: 0, total: 20 });
    await expect(
      service.importYaml(registryYaml, 'registry-import-2', now),
    ).resolves.toEqual({ created: 0, updated: 0, unchanged: 20, total: 20 });

    const sources = await service.listSources(now);
    expect(sources).toHaveLength(20);
    expect(
      sources.find(({ key }) => key === 'huggingface-models'),
    ).toMatchObject({
      enabled: false,
      termsStatus: 'review',
      healthStatus: 'unknown',
    });

    const audit = await client.query<{ count: number }>(
      `select count(*)::int as count from audit_logs
       where action like 'source.registry.%'`,
    );
    expect(audit.rows[0].count).toBe(20);

    const changedYaml = registryYaml.replace(
      'name: OpenAI Python SDK Releases',
      'name: OpenAI Python SDK Release Feed',
    );
    await expect(
      service.importYaml(changedYaml, 'registry-import-3', now),
    ).resolves.toEqual({ created: 0, updated: 1, unchanged: 19, total: 20 });
    const changed = await client.query<{ version: number }>(
      `select version from source_feeds
       where key = 'github-openai-python-releases'`,
    );
    expect(changed.rows[0].version).toBe(2);
  });

  it('creates one run and one source snapshot for repeated identical input', async () => {
    const service = new IngestionRunService(repository);
    const input = {
      jobKey: 'official-source-radar',
      scheduledAt: '2026-09-11T08:00:00.000Z',
      sources: ['github-openai-python-releases'],
    };
    const key = await service.expectedIdempotencyKey(input);

    await expect(
      service.createOrResume(input, key, now),
    ).resolves.toMatchObject({
      reused: false,
    });
    await expect(
      service.createOrResume(input, key, now),
    ).resolves.toMatchObject({
      reused: true,
    });

    const runCount = await client.query<{ count: number }>(
      'select count(*)::int as count from ingestion_runs',
    );
    const sourceCount = await client.query<{ count: number }>(
      'select count(*)::int as count from ingestion_run_sources',
    );
    expect(runCount.rows[0].count).toBe(1);
    expect(sourceCount.rows[0].count).toBe(1);
  });

  it('rejects disabled, terms-review, and unknown sources before creating a run', async () => {
    const service = new IngestionRunService(repository);
    for (const source of ['huggingface-models', 'does-not-exist']) {
      const input = {
        jobKey: 'developer-ecosystem-radar',
        scheduledAt: '2026-09-11T09:00:00.000Z',
        sources: [source],
      };
      const key = await service.expectedIdempotencyKey(input);
      await expect(
        service.createOrResume(input, key, now),
      ).rejects.toBeInstanceOf(IngestionValidationError);
    }
  });
});
