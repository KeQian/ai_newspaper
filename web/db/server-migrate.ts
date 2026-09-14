import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDatabase } from './client';
import { roleSeedStatement } from './seed';

const database = createDatabase(process.env.DATABASE_URL ?? '');
await migrate(database, { migrationsFolder: './drizzle' });
await database.execute(roleSeedStatement);
await database.transaction(async (tx) => {
  await tx.execute(sql`select 1`);
});
const result = await database.execute(sql`select count(*)::int as count from roles`);
if (result.rows[0]?.count !== 3) throw new Error('Reference roles missing');
console.log(JSON.stringify({ event: 'server.migration_verified', database: true, transaction: true, roles: 3 }));
