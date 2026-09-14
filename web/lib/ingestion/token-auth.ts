import { z } from 'zod';

const ingestionEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://')),
  INGESTION_TOKEN: z.string().min(32).max(512),
});

export function parseIngestionEnvironment(input: unknown) {
  return ingestionEnvironmentSchema.parse(input);
}

export async function hasValidIngestionToken(
  request: Request,
  expectedToken: string,
): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const suppliedToken = authorization.slice('Bearer '.length);
  const [suppliedDigest, expectedDigest] = await Promise.all([
    digest(suppliedToken),
    digest(expectedToken),
  ]);
  let difference = suppliedDigest.length ^ expectedDigest.length;
  const length = Math.max(suppliedDigest.length, expectedDigest.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (suppliedDigest[index] ?? 0) ^ (expectedDigest[index] ?? 0);
  }
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}
