import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { createDatabase } from './client';
import { DrizzleConnectorRepository } from '../lib/ingestion/connectors/drizzle-connector-repository';
import { FileRawArchiveStore } from '../lib/ingestion/connectors/file-archive-store';
import { SourceConnectorRunner } from '../lib/ingestion/connectors/runner';

const argumentsSchema = z.tuple([
  z.string().uuid(),
  z.string().min(1).max(120),
]);
const [runId, sourceKey] = argumentsSchema.parse(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
const archiveDirectory = process.env.RAW_ARCHIVE_DIR;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!archiveDirectory) throw new Error('RAW_ARCHIVE_DIR is required');

const runner = new SourceConnectorRunner(
  new DrizzleConnectorRepository(createDatabase(databaseUrl)),
  new FileRawArchiveStore(archiveDirectory),
  { getCredential: (name) => process.env[name] },
);
const requestId = `connector-${randomUUID()}`;

try {
  const result = await runner.run({ runId, sourceKey, requestId });
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'connector.completed',
      request_id: requestId,
      run_id: runId,
      source_key: sourceKey,
      ...result,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'connector.failed',
      request_id: requestId,
      run_id: runId,
      source_key: sourceKey,
      error_code: connectorErrorCode(error),
    }),
  );
  process.exitCode = 1;
}

function connectorErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.slice(0, 120);
  }
  return 'CONNECTOR_FAILED';
}
