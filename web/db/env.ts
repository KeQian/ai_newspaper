import { z } from 'zod';

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use the postgresql:// scheme',
    }),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function parseDatabaseEnvironment(input: unknown): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(input);
}
