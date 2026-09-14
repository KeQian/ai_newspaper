// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { roleSeedStatement } from '@/db/seed';
import { DrizzleAdminSessionRepository } from '@/lib/auth/drizzle-session-repository';
import { AuthenticationError } from '@/lib/auth/model';
import { hasPermission } from '@/lib/auth/permissions';
import { AdminSessionService } from '@/lib/auth/session-service';

const now = new Date('2026-09-11T08:00:00.000Z');
const roles = ['editor', 'chief_editor', 'admin'] as const;

describe('database-backed administrator authorization', () => {
  let client: PGlite;
  let service: AdminSessionService;

  beforeAll(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
    await database.execute(roleSeedStatement);

    for (const [index, role] of roles.entries()) {
      const email = `${role}@example.com`;
      const user = await client.query<{ id: string }>(
        `insert into admin_users (email, display_name)
         values ($1, $2) returning id`,
        [email, role],
      );
      const identity = await client.query<{ id: string }>(
        `insert into admin_identities (admin_user_id, issuer, subject, email_at_link)
         values ($1, 'https://id.example.com', $2, $3) returning id`,
        [user.rows[0].id, `subject-${index}`, email],
      );
      await client.query(
        `insert into admin_user_roles (user_id, role_id)
         select $1, id from roles where key = $2`,
        [user.rows[0].id, role],
      );
      expect(identity.rows[0].id).toBeTruthy();
    }

    const repository = new DrizzleAdminSessionRepository(
      database as unknown as Database,
    );
    service = new AdminSessionService(repository, {
      allowedEmails: new Set(roles.map((role) => `${role}@example.com`)),
      sessionTtlMinutes: 240,
    });
  }, 30_000);

  afterAll(async () => {
    await client.close();
  });

  it.each([
    ['editor', false, false],
    ['chief_editor', true, false],
    ['admin', true, true],
  ] as const)(
    'loads %s permissions through the session repository',
    async (role, canPublish, canManage) => {
      const index = roles.indexOf(role);
      const email = `${role}@example.com`;
      const { token } = await service.establishSession(
        {
          issuer: 'https://id.example.com',
          subject: `subject-${index}`,
          email,
          emailVerified: true,
          authenticatedAt: now,
          mfaVerifiedAt: now,
        },
        now,
      );

      const session = await service.getSession(token, now);
      expect(session.roles).toEqual([role]);
      expect(hasPermission(session.roles, 'content.publish')).toBe(canPublish);
      expect(hasPermission(session.roles, 'source.manage')).toBe(canManage);

      const stored = await client.query<{ token_hash: string }>(
        'select token_hash from admin_sessions where admin_user_id = $1 order by created_at desc limit 1',
        [session.adminId],
      );
      expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.rows[0].token_hash).not.toBe(token);
    },
  );

  it('invalidates existing sessions as soon as an account is disabled', async () => {
    const { token, session } = await service.establishSession(
      {
        issuer: 'https://id.example.com',
        subject: 'subject-0',
        email: 'editor@example.com',
        emailVerified: true,
        authenticatedAt: now,
        mfaVerifiedAt: now,
      },
      now,
    );

    await client.query(
      "update admin_users set status = 'disabled' where id = $1",
      [session.adminId],
    );
    await expect(service.getSession(token, now)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
});
