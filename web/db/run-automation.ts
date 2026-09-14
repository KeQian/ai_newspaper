import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { automationJobKeySchema } from '@/lib/automation/model';
import { DrizzleAutomationRepository } from '@/lib/automation/drizzle-repository';
import { AutomationService } from '@/lib/automation/service';
import { BatchConnectorRunner } from '@/lib/ingestion/connectors/batch-runner';
import { DrizzleConnectorRepository } from '@/lib/ingestion/connectors/drizzle-connector-repository';
import { FileRawArchiveStore } from '@/lib/ingestion/connectors/file-archive-store';
import { SourceConnectorRunner } from '@/lib/ingestion/connectors/runner';
import { DrizzleIngestionRepository } from '@/lib/ingestion/drizzle-repository';
import { IngestionRunService } from '@/lib/ingestion/run-service';

import { createDatabase } from './client';

const argumentsSchema = z.tuple([
  automationJobKeySchema,
  z.string().datetime({ offset: true }).optional(),
]);
const [jobKey, nowInput] = argumentsSchema.parse(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
const archiveDirectory = process.env.RAW_ARCHIVE_DIR;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!archiveDirectory) throw new Error('RAW_ARCHIVE_DIR is required');

const database = createDatabase(databaseUrl);
const connectorRepository = new DrizzleConnectorRepository(database);
const sourceRunner = new SourceConnectorRunner(
  connectorRepository,
  new FileRawArchiveStore(archiveDirectory),
  { getCredential: (name) => process.env[name] },
);
const batchRunner = new BatchConnectorRunner(connectorRepository, sourceRunner);
const service = new AutomationService(
  new DrizzleAutomationRepository(database),
  new IngestionRunService(new DrizzleIngestionRepository(database)),
  ({ heartbeat, ...input }) =>
    batchRunner.run({ ...input, beforeSource: heartbeat }),
);
const requestId = `automation-${randomUUID()}`;
const holderId = randomUUID();

try {
  const result = await service.runDue({
    jobKey,
    requestId,
    holderId,
    ...(nowInput ? { now: new Date(nowInput) } : {}),
  });
  const failed = result.windows.reduce((sum, window) => sum + window.failed, 0);
  console.log(
    JSON.stringify({
      level: failed > 0 ? 'warn' : 'info',
      event: 'automation.completed',
      request_id: requestId,
      job_key: jobKey,
      ...result,
    }),
  );
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'automation.failed',
      request_id: requestId,
      job_key: jobKey,
      error_code: error instanceof Error ? error.name : 'AUTOMATION_FAILED',
    }),
  );
  process.exitCode = 1;
}
