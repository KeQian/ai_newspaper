// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleOperationsRepository } from '@/lib/operations/drizzle-repository';
import { verifyRestoredDatabase } from '@/lib/operations/restore-verifier';

describe('operations database snapshot and restore verification', () => {
  let client: PGlite;
  let database: Database;

  beforeAll(async () => {
    client = new PGlite();
    const pgliteDatabase = drizzle(client);
    await migrate(pgliteDatabase, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    database = pgliteDatabase as unknown as Database;
  }, 90_000);

  afterAll(async () => client.close());

  it('reports degraded source and outbox state without returning sensitive rows', async () => {
    await client.query(
      `insert into source_feeds
       (key, name, source_type, reliability, url, enabled, schedule, parser_key, terms_status, retention_policy, owner, failure_count)
       values ('core', 'Core', 'api', 's0', 'https://example.com/api', true, 'hourly', 'api_v1', 'approved', 'excerpt', 'editorial', 3)`,
    );
    await client.query(
      `insert into outbox_events (event_type, payload, status, available_at)
       values ('cache.invalidate', '{}', 'failed', '2026-09-13T00:00:00Z')`,
    );
    const snapshot = await new DrizzleOperationsRepository(database).snapshot(
      new Date('2026-09-14T01:00:00.000Z'),
    );
    expect(snapshot.sources).toEqual({ failing: 1, staleCore: 1 });
    expect(snapshot.outbox.failed).toBe(1);
    await expect(verifyRestoredDatabase(database)).resolves.toMatchObject({
      ok: true,
      criticalCounts: { enabledSources: 1 },
    });
  });
});
