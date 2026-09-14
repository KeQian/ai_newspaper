// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleAuditRepository } from '@/lib/audit/drizzle-repository';

describe('database-backed audit query', () => {
  let client: PGlite;
  let repository: DrizzleAuditRepository;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    repository = new DrizzleAuditRepository(database as unknown as Database);
    const admin = await client.query<{ id: string }>(
      `insert into admin_users (email, display_name) values ('admin@example.com', 'Launch Admin') returning id`,
    );
    await client.query(
      `insert into audit_logs (id, actor_id, action, object_type, object_id, request_id, after, created_at)
       values
       ('11111111-1111-4111-8111-111111111111', $1, 'content.published', 'content_item', '33333333-3333-4333-8333-333333333333', 'request-1', '{"status":"published"}', '2026-09-14T01:00:00Z'),
       ('22222222-2222-4222-8222-222222222222', $1, 'content.withdrawn', 'content_item', '33333333-3333-4333-8333-333333333333', 'request-2', '{"status":"withdrawn"}', '2026-09-14T02:00:00Z')`,
      [admin.rows[0].id],
    );
  }, 90_000);

  afterAll(async () => client.close());

  it('filters exactly and paginates deterministically by time and id', async () => {
    await expect(
      repository.list({ action: 'content.published', limit: 10 }),
    ).resolves.toMatchObject([
      {
        action: 'content.published',
        actorName: 'Launch Admin',
        requestId: 'request-1',
      },
    ]);
    await expect(
      repository.list({
        objectType: 'content_item',
        limit: 10,
        before: {
          createdAt: new Date('2026-09-14T02:00:00.000Z'),
          id: '22222222-2222-4222-8222-222222222222',
        },
      }),
    ).resolves.toMatchObject([{ requestId: 'request-1' }]);
  });
});
