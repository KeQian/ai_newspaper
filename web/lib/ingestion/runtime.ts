import { createDatabase } from '@/db/client';

import { DrizzleIngestionRepository } from './drizzle-repository';
import { parseIngestionEnvironment } from './token-auth';

export function createIngestionRepositoryFromEnvironment() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return new DrizzleIngestionRepository(createDatabase(databaseUrl));
}

export function getIngestionTokenFromEnvironment(): string {
  return parseIngestionEnvironment(process.env).INGESTION_TOKEN;
}
