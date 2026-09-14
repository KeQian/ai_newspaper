import { createDatabase } from '@/db/client';
import { DrizzleOperationsRepository } from '@/lib/operations/drizzle-repository';
import { createOperationsStatusHandler } from '@/lib/operations/http';

export const dynamic = 'force-dynamic';

export const GET = createOperationsStatusHandler({
  getExpectedToken: () => {
    const token = process.env.OPERATIONS_TOKEN;
    if (!token || token.length < 32)
      throw new Error('OPERATIONS_TOKEN is required');
    return token;
  },
  createRepository: () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    return new DrizzleOperationsRepository(createDatabase(databaseUrl));
  },
});
