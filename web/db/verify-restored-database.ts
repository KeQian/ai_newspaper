import { createDatabase } from '@/db/client';
import { verifyRestoredDatabase } from '@/lib/operations/restore-verifier';

const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (!restoreUrl) throw new Error('RESTORE_DATABASE_URL is required');
if (restoreUrl === process.env.DATABASE_URL) {
  throw new Error('RESTORE_DATABASE_URL must not equal DATABASE_URL');
}

try {
  const result = await verifyRestoredDatabase(createDatabase(restoreUrl));
  console.log(
    JSON.stringify({ event: 'restore_verification.completed', ...result }),
  );
} catch {
  console.error(
    JSON.stringify({
      event: 'restore_verification.failed',
      error_code: 'RESTORE_DATABASE_INVALID',
    }),
  );
  process.exitCode = 1;
}
