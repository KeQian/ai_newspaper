import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { createDatabase } from './client';
import { BatchConnectorRunner } from '../lib/ingestion/connectors/batch-runner';
import { DrizzleConnectorRepository } from '../lib/ingestion/connectors/drizzle-connector-repository';
import { FileRawArchiveStore } from '../lib/ingestion/connectors/file-archive-store';
import { SourceConnectorRunner } from '../lib/ingestion/connectors/runner';

const [runId] = z.tuple([z.string().uuid()]).parse(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
const archiveDirectory = process.env.RAW_ARCHIVE_DIR;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!archiveDirectory) throw new Error('RAW_ARCHIVE_DIR is required');

const repository = new DrizzleConnectorRepository(createDatabase(databaseUrl));
const sourceRunner = new SourceConnectorRunner(
  repository,
  new FileRawArchiveStore(archiveDirectory),
  { getCredential: (name) => process.env[name] },
);
const requestId = `batch-${randomUUID()}`;

try {
  const result = await new BatchConnectorRunner(repository, sourceRunner).run({
    runId,
    requestId,
  });
  console.log(
    JSON.stringify({
      level: result.failed > 0 ? 'warn' : 'info',
      event: 'connector_batch.completed',
      request_id: requestId,
      run_id: runId,
      ...result,
    }),
  );
  if (result.failed > 0) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'connector_batch.failed',
      request_id: requestId,
      run_id: runId,
      error_code: 'BATCH_FAILED',
    }),
  );
  process.exitCode = 1;
}
