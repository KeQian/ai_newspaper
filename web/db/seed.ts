import { sql } from 'drizzle-orm';

import { createDatabase } from './client';

export const roleSeedStatement = sql`
  insert into roles (key)
  values ('editor'), ('chief_editor'), ('admin')
  on conflict (key) do nothing
`;

export async function seedReferenceData(databaseUrl: string): Promise<void> {
  const database = createDatabase(databaseUrl);

  await database.execute(roleSeedStatement);
}
