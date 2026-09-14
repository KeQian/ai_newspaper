import type { ImportedSource } from './source-registry';

export type SourceRegistryImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
};

export type StoredSourceFeed = {
  id: string;
  key: string;
  name: string;
  sourceType: string;
  reliability: string;
  enabled: boolean;
  schedule: string;
  termsStatus: string;
  lastSuccessAt: Date | null;
  failureCount: number;
  version: number;
};

export type StoredIngestionRun = {
  id: string;
  jobKey: string;
  idempotencyKey: string;
  status: string;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  fetchedCount: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  errorSummary: string | null;
};

export type StoredRunSource = {
  sourceId: string;
  sourceKey: string;
  sourceName: string;
  status: string;
  cursorBefore: Record<string, unknown> | null;
  cursorAfter: Record<string, unknown> | null;
  archiveObjectKey: string | null;
  fetchedCount: number;
  newCount: number;
  errorCode: string | null;
  errorDetail: string | null;
};

export interface SourceRegistryRepository {
  importSources(
    sources: readonly ImportedSource[],
    requestId: string,
    now: Date,
  ): Promise<SourceRegistryImportResult>;
  listSources(): Promise<StoredSourceFeed[]>;
}

export interface IngestionRunRepository {
  createOrGetRun(input: {
    jobKey: string;
    idempotencyKey: string;
    scheduledAt: Date;
    sourceKeys: readonly string[];
    cursor?: Record<string, unknown>;
    now: Date;
  }): Promise<{ run: StoredIngestionRun; reused: boolean }>;
  listRuns(input: {
    limit: number;
    before?: { scheduledAt: Date; id: string };
  }): Promise<StoredIngestionRun[]>;
  getRun(id: string): Promise<{
    run: StoredIngestionRun;
    sources: StoredRunSource[];
  } | null>;
}
