import { createDatabase } from '@/db/client';

import { DrizzleContentRepository } from './drizzle-repository';
import { ContentService } from './service';

export function createContentServiceFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new ContentService(
    new DrizzleContentRepository(createDatabase(databaseUrl)),
  );
}
