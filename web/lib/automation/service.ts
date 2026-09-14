import type { BatchRunResult } from '@/lib/ingestion/connectors/batch-runner';

import {
  AutomationLeaseUnavailableError,
  automationJobs,
  type AutomationJobKey,
} from './model';
import type { AutomationRepository, AutomationWindowResult } from './types';
import { dueScheduledWindows, isSourceScheduleDue } from './windows';

const LEASE_MILLISECONDS = 30 * 60_000;

export class AutomationService {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly ingestionRuns: {
      expectedIdempotencyKey(input: {
        jobKey: string;
        scheduledAt: string;
        sources: string[];
      }): Promise<string>;
      createOrResume(
        input: {
          jobKey: string;
          scheduledAt: string;
          sources: string[];
        },
        idempotencyKey: string,
        now: Date,
      ): Promise<{ run: { id: string }; reused: boolean }>;
    },
    private readonly executeBatch: (input: {
      runId: string;
      requestId: string;
      heartbeat: () => Promise<void>;
    }) => Promise<BatchRunResult>,
  ) {}

  async runDue(input: {
    jobKey: AutomationJobKey;
    holderId: string;
    requestId: string;
    now?: Date;
  }): Promise<{
    recovered: number;
    windows: AutomationWindowResult[];
  }> {
    const now = input.now ?? new Date();
    const lease = await this.repository.acquireLease({
      jobKey: input.jobKey,
      holderId: input.holderId,
      now,
      expiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
    });
    if (!lease) throw new AutomationLeaseUnavailableError();

    try {
      const recovered = await this.repository.recoverStaleSources(
        new Date(now.getTime() - LEASE_MILLISECONDS),
        now,
      );
      const definition = automationJobs[input.jobKey];
      const latestScheduledAt = await this.repository.latestScheduledAt(
        input.jobKey,
      );
      const sources = await this.repository.listEligibleSources(definition);
      const windows = dueScheduledWindows({
        definition,
        now,
        latestScheduledAt,
      });
      const results: AutomationWindowResult[] = [];

      for (const scheduledAt of windows) {
        const sourceKeys = sources
          .filter(({ schedule }) => isSourceScheduleDue(schedule, scheduledAt))
          .map(({ key }) => key);
        if (sourceKeys.length === 0) {
          results.push({
            scheduledAt: scheduledAt.toISOString(),
            runId: null,
            reused: false,
            status: 'skipped',
            succeeded: 0,
            failed: 0,
            skipped: 0,
            reason: 'NO_SOURCES_DUE',
          });
          continue;
        }

        const runInput = {
          jobKey: input.jobKey,
          scheduledAt: scheduledAt.toISOString(),
          sources: sourceKeys,
        };
        const idempotencyKey =
          await this.ingestionRuns.expectedIdempotencyKey(runInput);
        const run = await this.ingestionRuns.createOrResume(
          runInput,
          idempotencyKey,
          now,
        );
        const batch = await this.executeBatch({
          runId: run.run.id,
          requestId: input.requestId,
          heartbeat: async () => {
            const heartbeatAt = new Date();
            const renewed = await this.repository.acquireLease({
              jobKey: input.jobKey,
              holderId: input.holderId,
              now: heartbeatAt,
              expiresAt: new Date(heartbeatAt.getTime() + LEASE_MILLISECONDS),
            });
            if (!renewed) throw new AutomationLeaseUnavailableError();
          },
        });
        results.push({
          scheduledAt: scheduledAt.toISOString(),
          runId: run.run.id,
          reused: run.reused,
          status: batch.failed > 0 ? 'partial' : 'completed',
          succeeded: batch.succeeded,
          failed: batch.failed,
          skipped: batch.skipped,
        });
      }

      return { recovered, windows: results };
    } finally {
      await this.repository.releaseLease(input.jobKey, input.holderId);
    }
  }
}
