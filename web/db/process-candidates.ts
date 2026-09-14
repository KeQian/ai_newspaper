import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { createDatabase } from './client';
import { DrizzleCandidateRepository } from '../lib/ingestion/candidates/drizzle-repository';
import { loadCandidateResponseBundle } from '../lib/ingestion/candidates/file-model-adapter';
import { CandidateGenerationService } from '../lib/ingestion/candidates/service';

const [runId, bundlePath] = z
  .tuple([z.string().uuid(), z.string().min(1).max(2000)])
  .parse(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
const responseDirectory = process.env.CANDIDATE_RESPONSE_DIR;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!responseDirectory) throw new Error('CANDIDATE_RESPONSE_DIR is required');
const requestId = `candidate-${randomUUID()}`;

try {
  const bundle = await loadCandidateResponseBundle(
    bundlePath,
    responseDirectory,
  );
  const service = new CandidateGenerationService(
    new DrizzleCandidateRepository(createDatabase(databaseUrl)),
    bundle.adapter,
    { promptVersion: bundle.promptVersion },
  );
  const result = await service.processRun(runId);
  console.log(
    JSON.stringify({
      level: result.failed > 0 ? 'warn' : 'info',
      event: 'candidate_processing.completed',
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
      event: 'candidate_processing.failed',
      request_id: requestId,
      run_id: runId,
      error_code: 'CANDIDATE_PROCESSING_FAILED',
    }),
  );
  process.exitCode = 1;
}
