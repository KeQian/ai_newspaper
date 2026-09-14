import type { ConnectorRepository } from './types';

export type SourceRunExecutor = {
  run(input: {
    runId: string;
    sourceKey: string;
    requestId: string;
    now?: Date;
  }): Promise<unknown>;
};

export class BatchConnectorRunner {
  constructor(
    private readonly repository: Pick<ConnectorRepository, 'listRunSources'>,
    private readonly executor: SourceRunExecutor,
  ) {}

  async run(input: {
    runId: string;
    requestId: string;
    now?: () => Date;
    beforeSource?: () => Promise<void>;
  }): Promise<BatchRunResult> {
    const states = await this.repository.listRunSources(input.runId);
    if (states.length === 0) throw new Error('Ingestion run not found');

    const results: BatchSourceResult[] = [];
    for (const state of states) {
      if (!['queued', 'failed'].includes(state.status)) {
        results.push({
          sourceKey: state.sourceKey,
          status: 'skipped',
          errorCode: null,
        });
        continue;
      }

      try {
        await input.beforeSource?.();
        await this.executor.run({
          runId: input.runId,
          sourceKey: state.sourceKey,
          requestId: input.requestId,
          now: input.now?.(),
        });
        results.push({
          sourceKey: state.sourceKey,
          status: 'succeeded',
          errorCode: null,
        });
      } catch (error) {
        results.push({
          sourceKey: state.sourceKey,
          status: 'failed',
          errorCode: safeErrorCode(error),
        });
      }
    }

    return {
      total: results.length,
      succeeded: count(results, 'succeeded'),
      failed: count(results, 'failed'),
      skipped: count(results, 'skipped'),
      sources: results,
    };
  }
}

export type BatchSourceResult = {
  sourceKey: string;
  status: 'succeeded' | 'failed' | 'skipped';
  errorCode: string | null;
};

export type BatchRunResult = {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  sources: BatchSourceResult[];
};

function count(
  results: readonly BatchSourceResult[],
  status: BatchSourceResult['status'],
): number {
  return results.filter((result) => result.status === status).length;
}

function safeErrorCode(error: unknown): string {
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
