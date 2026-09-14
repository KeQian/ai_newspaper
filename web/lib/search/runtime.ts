import { createDatabase } from '@/db/client';

import { DrizzleSearchRepository } from './drizzle-repository';
import { PostgresSearchRateLimiter } from './rate-limit';
import { SearchService } from './service';

export function createSearchService() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new SearchService(
    new DrizzleSearchRepository(createDatabase(databaseUrl)),
  );
}

export function searchRateLimiter() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    return {
      async consume() {
        throw new Error('DATABASE_URL is required');
      },
    };
  return new PostgresSearchRateLimiter(createDatabase(databaseUrl));
}
