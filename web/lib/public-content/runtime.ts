import { createDatabase } from '@/db/client';

import { DrizzlePublicContentRepository } from './drizzle-repository';
import { PublicContentService } from './service';

export function createPublicContentServiceFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new PublicContentService(
    new DrizzlePublicContentRepository(createDatabase(databaseUrl)),
  );
}
