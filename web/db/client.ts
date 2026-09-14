import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const pools = new Map<string, pg.Pool>();

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  let pool = pools.get(databaseUrl);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    pool.on('error', () =>
      console.error(JSON.stringify({ event: 'database.pool_error' })),
    );
    pools.set(databaseUrl, pool);
  }
  return drizzle({ client: pool });
}

export type Database = ReturnType<typeof createDatabase>;
