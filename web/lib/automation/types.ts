import type { AutomationJobDefinition } from './model';

export type AutomationSource = {
  key: string;
  schedule: string;
};

export interface AutomationRepository {
  acquireLease(input: {
    jobKey: string;
    holderId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  releaseLease(jobKey: string, holderId: string): Promise<void>;
  recoverStaleSources(cutoff: Date, now: Date): Promise<number>;
  latestScheduledAt(jobKey: string): Promise<Date | null>;
  listEligibleSources(
    definition: AutomationJobDefinition,
  ): Promise<AutomationSource[]>;
}

export type AutomationWindowResult = {
  scheduledAt: string;
  runId: string | null;
  reused: boolean;
  status: 'completed' | 'partial' | 'skipped';
  succeeded: number;
  failed: number;
  skipped: number;
  reason?: 'NO_SOURCES_DUE';
};
