import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  neonConfig.fetchConnectionCache = true;
  const client = neon(databaseUrl);
  // Repositories use explicit table objects and do not use Drizzle's relational
  // `database.query` API. Omitting the full schema here keeps the shared client
  // type small and prevents recursive type expansion as projections are added.
  return drizzle({ client });
}

export type Database = ReturnType<typeof createDatabase>;
