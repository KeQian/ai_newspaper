import { createDatabase } from '@/db/client';

import { DrizzleEditorialCandidateRepository } from './drizzle-repository';
import { EditorialCandidateService } from './service';

export function createEditorialCandidateServiceFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new EditorialCandidateService(
    new DrizzleEditorialCandidateRepository(createDatabase(databaseUrl)),
  );
}
