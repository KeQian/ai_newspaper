import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  auditLogs,
  ingestionRuns,
  ingestionRunSources,
  sourceFeeds,
} from '@/db/schema';

import { IngestionConflictError, IngestionValidationError } from './model';
import type {
  IngestionRunRepository,
  SourceRegistryImportResult,
  SourceRegistryRepository,
  StoredIngestionRun,
  StoredRunSource,
  StoredSourceFeed,
} from './repository';
import type { ImportedSource } from './source-registry';

export class DrizzleIngestionRepository
  implements SourceRegistryRepository, IngestionRunRepository
{
  constructor(private readonly database: Database) {}

  async importSources(
    sources: readonly ImportedSource[],
    requestId: string,
    now: Date,
  ): Promise<SourceRegistryImportResult> {
    return this.database.transaction(async (transaction) => {
      const existing = await transaction
        .select()
        .from(sourceFeeds)
        .where(
          inArray(
            sourceFeeds.key,
            sources.map(({ key }) => key),
          ),
        );
      const byKey = new Map(existing.map((source) => [source.key, source]));
      const result = {
        created: 0,
        updated: 0,
        unchanged: 0,
        total: sources.length,
      };

      for (const source of sources) {
        const current = byKey.get(source.key);
        if (!current) {
          const [created] = await transaction
            .insert(sourceFeeds)
            .values(source)
            .returning({ id: sourceFeeds.id });
          await transaction.insert(auditLogs).values({
            action: 'source.registry.created',
            objectType: 'source_feed',
            objectId: created.id,
            requestId,
            after: auditSnapshot(source),
            createdAt: now,
            updatedAt: now,
          });
          result.created += 1;
          continue;
        }

        if (!sourceConfigurationChanged(current, source)) {
          result.unchanged += 1;
          continue;
        }

        await transaction
          .update(sourceFeeds)
          .set({
            ...source,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(eq(sourceFeeds.id, current.id));
        await transaction.insert(auditLogs).values({
          action: 'source.registry.updated',
          objectType: 'source_feed',
          objectId: current.id,
          requestId,
          before: auditSnapshot(current),
          after: auditSnapshot(source),
          createdAt: now,
          updatedAt: now,
        });
        result.updated += 1;
      }

      return result;
    });
  }

  async listSources(): Promise<StoredSourceFeed[]> {
    return this.database
      .select({
        id: sourceFeeds.id,
        key: sourceFeeds.key,
        name: sourceFeeds.name,
        sourceType: sourceFeeds.sourceType,
        reliability: sourceFeeds.reliability,
        enabled: sourceFeeds.enabled,
        schedule: sourceFeeds.schedule,
        termsStatus: sourceFeeds.termsStatus,
        lastSuccessAt: sourceFeeds.lastSuccessAt,
        failureCount: sourceFeeds.failureCount,
        version: sourceFeeds.version,
      })
      .from(sourceFeeds)
      .orderBy(sourceFeeds.name, sourceFeeds.key);
  }

  async createOrGetRun(input: {
    jobKey: string;
    idempotencyKey: string;
    scheduledAt: Date;
    sourceKeys: readonly string[];
    cursor?: Record<string, unknown>;
    now: Date;
  }): Promise<{ run: StoredIngestionRun; reused: boolean }> {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select(runSelection)
        .from(ingestionRuns)
        .where(eq(ingestionRuns.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return { run: existing, reused: true };

      const sources = await transaction
        .select({
          id: sourceFeeds.id,
          key: sourceFeeds.key,
          cursor: sourceFeeds.cursor,
          enabled: sourceFeeds.enabled,
          termsStatus: sourceFeeds.termsStatus,
        })
        .from(sourceFeeds)
        .where(inArray(sourceFeeds.key, [...input.sourceKeys]));

      const byKey = new Map(sources.map((source) => [source.key, source]));
      const unavailable = input.sourceKeys.filter((key) => {
        const source = byKey.get(key);
        return !source || !source.enabled || source.termsStatus !== 'approved';
      });
      if (unavailable.length > 0) {
        throw new IngestionValidationError(
          `Sources are unavailable: ${unavailable.join(', ')}`,
        );
      }

      const [run] = await transaction
        .insert(ingestionRuns)
        .values({
          jobKey: input.jobKey,
          idempotencyKey: input.idempotencyKey,
          scheduledAt: input.scheduledAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: ingestionRuns.idempotencyKey })
        .returning(runSelection);

      if (!run) {
        const [concurrent] = await transaction
          .select(runSelection)
          .from(ingestionRuns)
          .where(eq(ingestionRuns.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (!concurrent) throw new IngestionConflictError();
        return { run: concurrent, reused: true };
      }

      await transaction.insert(ingestionRunSources).values(
        input.sourceKeys.map((key) => {
          const source = byKey.get(key)!;
          const override = input.cursor?.[key];
          return {
            runId: run.id,
            sourceFeedId: source.id,
            cursorBefore: isRecord(override) ? override : source.cursor,
            createdAt: input.now,
            updatedAt: input.now,
          };
        }),
      );

      return { run, reused: false };
    });
  }

  async listRuns(input: {
    limit: number;
    before?: { scheduledAt: Date; id: string };
  }): Promise<StoredIngestionRun[]> {
    return this.database
      .select(runSelection)
      .from(ingestionRuns)
      .where(
        input.before
          ? or(
              lt(ingestionRuns.scheduledAt, input.before.scheduledAt),
              and(
                eq(ingestionRuns.scheduledAt, input.before.scheduledAt),
                lt(ingestionRuns.id, input.before.id),
              ),
            )
          : undefined,
      )
      .orderBy(desc(ingestionRuns.scheduledAt), desc(ingestionRuns.id))
      .limit(input.limit);
  }

  async getRun(id: string): Promise<{
    run: StoredIngestionRun;
    sources: StoredRunSource[];
  } | null> {
    const [run] = await this.database
      .select(runSelection)
      .from(ingestionRuns)
      .where(eq(ingestionRuns.id, id))
      .limit(1);
    if (!run) return null;

    const sources = await this.database
      .select({
        sourceId: sourceFeeds.id,
        sourceKey: sourceFeeds.key,
        sourceName: sourceFeeds.name,
        status: ingestionRunSources.status,
        cursorBefore: ingestionRunSources.cursorBefore,
        cursorAfter: ingestionRunSources.cursorAfter,
        archiveObjectKey: ingestionRunSources.archiveObjectKey,
        fetchedCount: ingestionRunSources.fetchedCount,
        newCount: ingestionRunSources.newCount,
        errorCode: ingestionRunSources.errorCode,
        errorDetail: ingestionRunSources.errorDetail,
      })
      .from(ingestionRunSources)
      .innerJoin(
        sourceFeeds,
        eq(ingestionRunSources.sourceFeedId, sourceFeeds.id),
      )
      .where(eq(ingestionRunSources.runId, id))
      .orderBy(sourceFeeds.key);

    return { run, sources };
  }
}

const runSelection = {
  id: ingestionRuns.id,
  jobKey: ingestionRuns.jobKey,
  idempotencyKey: ingestionRuns.idempotencyKey,
  status: ingestionRuns.status,
  scheduledAt: ingestionRuns.scheduledAt,
  startedAt: ingestionRuns.startedAt,
  finishedAt: ingestionRuns.finishedAt,
  fetchedCount: ingestionRuns.fetchedCount,
  newCount: ingestionRuns.newCount,
  duplicateCount: ingestionRuns.duplicateCount,
  errorCount: ingestionRuns.errorCount,
  errorSummary: ingestionRuns.errorSummary,
};

function sourceConfigurationChanged(
  current: typeof sourceFeeds.$inferSelect,
  source: ImportedSource,
): boolean {
  return (
    current.name !== source.name ||
    current.sourceType !== source.sourceType ||
    current.reliability !== source.reliability ||
    current.url !== source.url ||
    current.enabled !== source.enabled ||
    current.schedule !== source.schedule ||
    current.parserKey !== source.parserKey ||
    current.termsStatus !== source.termsStatus ||
    current.retentionPolicy !== source.retentionPolicy ||
    current.owner !== source.owner ||
    stableJson(current.config) !== stableJson(source.config)
  );
}

function auditSnapshot(source: {
  key: string;
  name: string;
  sourceType: string;
  reliability: string;
  url: string;
  enabled: boolean;
  schedule: string;
  parserKey: string;
  termsStatus: string;
  retentionPolicy: string;
  owner: string;
  config: Record<string, unknown>;
}): Record<string, unknown> {
  return { ...source };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}
