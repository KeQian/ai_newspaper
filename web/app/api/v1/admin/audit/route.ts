import { DrizzleAuditRepository } from '@/lib/audit/drizzle-repository';
import { createAuditHandler } from '@/lib/audit/http';
import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createDatabase } from '@/db/client';

export const dynamic = 'force-dynamic';

export const GET = createAuditHandler({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createRepository: () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    return new DrizzleAuditRepository(createDatabase(databaseUrl));
  },
});
