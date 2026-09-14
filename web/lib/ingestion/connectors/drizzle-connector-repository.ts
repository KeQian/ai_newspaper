import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  auditLogs,
  ingestionRunDocuments,
  ingestionRuns,
  ingestionRunSources,
  rawDocuments,
  sourceFeeds,
} from '@/db/schema';

import type {
  ConnectorCompletion,
  ConnectorFailure,
  ConnectorRepository,
  ConnectorRunContext,
} from './types';

export class DrizzleConnectorRepository implements ConnectorRepository {
  constructor(private readonly database: Database) {}

  async listRunSources(
    runId: string,
  ): Promise<Array<{ sourceKey: string; status: string }>> {
    return this.database
      .select({
        sourceKey: sourceFeeds.key,
        status: ingestionRunSources.status,
      })
      .from(ingestionRunSources)
      .innerJoin(
        sourceFeeds,
        eq(ingestionRunSources.sourceFeedId, sourceFeeds.id),
      )
      .where(eq(ingestionRunSources.runId, runId))
      .orderBy(sourceFeeds.key);
  }

  async getRunContext(
    runId: string,
    sourceKey: string,
  ): Promise<ConnectorRunContext> {
    const [row] = await this.database
      .select({
        runId: ingestionRuns.id,
        runStatus: ingestionRuns.status,
        sourceRunStatus: ingestionRunSources.status,
        sourceId: sourceFeeds.id,
        sourceKey: sourceFeeds.key,
        sourceName: sourceFeeds.name,
        sourceUrl: sourceFeeds.url,
        parserKey: sourceFeeds.parserKey,
        enabled: sourceFeeds.enabled,
        termsStatus: sourceFeeds.termsStatus,
        sourceCursor: sourceFeeds.cursor,
        sourceConfig: sourceFeeds.config,
        cursorBefore: ingestionRunSources.cursorBefore,
      })
      .from(ingestionRunSources)
      .innerJoin(ingestionRuns, eq(ingestionRunSources.runId, ingestionRuns.id))
      .innerJoin(
        sourceFeeds,
        eq(ingestionRunSources.sourceFeedId, sourceFeeds.id),
      )
      .where(and(eq(ingestionRuns.id, runId), eq(sourceFeeds.key, sourceKey)))
      .limit(1);

    if (!row) throw new Error('Run source not found');
    if (row.sourceRunStatus === 'succeeded') {
      throw new Error('Run source has already completed');
    }
    if (row.runStatus === 'cancelled' || row.runStatus === 'succeeded') {
      throw new Error('Run is not executable');
    }

    return {
      runId: row.runId,
      source: {
        id: row.sourceId,
        key: row.sourceKey,
        name: row.sourceName,
        url: row.sourceUrl,
        parserKey: row.parserKey,
        enabled: row.enabled,
        termsStatus: row.termsStatus,
        cursor: row.sourceCursor,
        config: row.sourceConfig,
      },
      cursorBefore: row.cursorBefore ?? row.sourceCursor,
    };
  }

  async markRunning(
    runId: string,
    sourceId: string,
    startedAt: Date,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(ingestionRunSources)
        .set({
          status: 'running',
          cursorAfter: null,
          archiveObjectKey: null,
          fetchedCount: 0,
          newCount: 0,
          errorCode: null,
          errorDetail: null,
          updatedAt: startedAt,
        })
        .where(
          and(
            eq(ingestionRunSources.runId, runId),
            eq(ingestionRunSources.sourceFeedId, sourceId),
            inArray(ingestionRunSources.status, ['queued', 'failed']),
          ),
        )
        .returning({ runId: ingestionRunSources.runId });
      if (updated.length === 0) throw new Error('Run source cannot start');

      await transaction
        .update(ingestionRuns)
        .set({
          status: 'running',
          startedAt: sql`coalesce(${ingestionRuns.startedAt}, ${startedAt})`,
          finishedAt: null,
          updatedAt: startedAt,
        })
        .where(eq(ingestionRuns.id, runId));
    });
  }

  async completeSource(input: ConnectorCompletion): Promise<{
    fetchedCount: number;
    newCount: number;
    duplicateCount: number;
  }> {
    return this.database.transaction(async (transaction) => {
      let newCount = 0;
      for (const document of input.documents) {
        const [existing] = await transaction
          .select({
            id: rawDocuments.id,
            contentHash: rawDocuments.contentHash,
          })
          .from(rawDocuments)
          .where(
            and(
              eq(rawDocuments.sourceFeedId, input.sourceId),
              eq(rawDocuments.externalId, document.externalId),
            ),
          )
          .limit(1);

        let rawDocumentId = existing?.id;
        let disposition: 'new' | 'changed' | 'duplicate' = 'duplicate';
        if (existing) {
          if (existing.contentHash !== document.contentHash) {
            await transaction
              .update(rawDocuments)
              .set({
                ...document,
                status: 'changed',
                fetchedAt: input.fetchedAt,
                rawObjectKey: input.archiveKey,
                httpEtag: input.httpEtag,
                httpLastModified: input.httpLastModified,
                updatedAt: input.fetchedAt,
              })
              .where(eq(rawDocuments.id, existing.id));
            disposition = 'changed';
          }
        } else {
          const inserted = await transaction
            .insert(rawDocuments)
            .values({
              sourceFeedId: input.sourceId,
              ...document,
              fetchedAt: input.fetchedAt,
              rawObjectKey: input.archiveKey,
              httpEtag: input.httpEtag,
              httpLastModified: input.httpLastModified,
              createdAt: input.fetchedAt,
              updatedAt: input.fetchedAt,
            })
            .onConflictDoNothing()
            .returning({ id: rawDocuments.id });
          rawDocumentId = inserted[0]?.id;
          if (rawDocumentId) {
            disposition = 'new';
            newCount += 1;
          } else {
            const [concurrent] = await transaction
              .select({ id: rawDocuments.id })
              .from(rawDocuments)
              .where(
                and(
                  eq(rawDocuments.sourceFeedId, input.sourceId),
                  eq(rawDocuments.externalId, document.externalId),
                ),
              )
              .limit(1);
            rawDocumentId = concurrent?.id;
          }
        }

        if (!rawDocumentId) throw new Error('Raw document persistence failed');
        await transaction
          .insert(ingestionRunDocuments)
          .values({
            runId: input.runId,
            rawDocumentId,
            observedContentHash: document.contentHash,
            disposition,
            createdAt: input.fetchedAt,
            updatedAt: input.fetchedAt,
          })
          .onConflictDoUpdate({
            target: [
              ingestionRunDocuments.runId,
              ingestionRunDocuments.rawDocumentId,
            ],
            set: {
              observedContentHash: document.contentHash,
              disposition,
              updatedAt: input.fetchedAt,
            },
          });
      }

      const fetchedCount = input.documents.length;
      const completed = await transaction
        .update(ingestionRunSources)
        .set({
          status: 'succeeded',
          cursorAfter: input.cursorAfter,
          archiveObjectKey: input.archiveKey,
          fetchedCount,
          newCount,
          errorCode: null,
          errorDetail: null,
          updatedAt: input.fetchedAt,
        })
        .where(
          and(
            eq(ingestionRunSources.runId, input.runId),
            eq(ingestionRunSources.sourceFeedId, input.sourceId),
            eq(ingestionRunSources.status, 'running'),
          ),
        )
        .returning({ runId: ingestionRunSources.runId });
      if (completed.length === 0) {
        throw new Error('Run source cannot commit');
      }
      await transaction
        .update(sourceFeeds)
        .set({
          cursor: input.cursorAfter,
          lastSuccessAt: input.fetchedAt,
          failureCount: 0,
          updatedAt: input.fetchedAt,
        })
        .where(eq(sourceFeeds.id, input.sourceId));

      const sourceStates = await transaction
        .select({
          status: ingestionRunSources.status,
          fetchedCount: ingestionRunSources.fetchedCount,
          newCount: ingestionRunSources.newCount,
        })
        .from(ingestionRunSources)
        .where(eq(ingestionRunSources.runId, input.runId));
      const aggregate = aggregateRun(sourceStates, input.fetchedAt);
      await transaction
        .update(ingestionRuns)
        .set({ ...aggregate, updatedAt: input.fetchedAt })
        .where(eq(ingestionRuns.id, input.runId));

      return {
        fetchedCount,
        newCount,
        duplicateCount: fetchedCount - newCount,
      };
    });
  }

  async failSource(input: ConnectorFailure): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(ingestionRunSources)
        .set({
          status: 'failed',
          cursorAfter: null,
          archiveObjectKey: input.archiveKey,
          errorCode: input.code.slice(0, 120),
          errorDetail: input.detail.slice(0, 2000),
          updatedAt: input.failedAt,
        })
        .where(
          and(
            eq(ingestionRunSources.runId, input.runId),
            eq(ingestionRunSources.sourceFeedId, input.sourceId),
          ),
        );

      const [source] = await transaction
        .select({
          enabled: sourceFeeds.enabled,
          version: sourceFeeds.version,
          key: sourceFeeds.key,
        })
        .from(sourceFeeds)
        .where(eq(sourceFeeds.id, input.sourceId))
        .limit(1);
      await transaction
        .update(sourceFeeds)
        .set({
          failureCount: sql`${sourceFeeds.failureCount} + 1`,
          ...(input.disableSource
            ? { enabled: false, version: source.version + 1 }
            : {}),
          updatedAt: input.failedAt,
        })
        .where(eq(sourceFeeds.id, input.sourceId));

      if (input.disableSource && source.enabled) {
        await transaction.insert(auditLogs).values({
          action: 'source.auto_disabled.authorization',
          objectType: 'source_feed',
          objectId: input.sourceId,
          before: { enabled: true, key: source.key },
          after: { enabled: false, key: source.key, reason: input.code },
          requestId: input.requestId,
          createdAt: input.failedAt,
          updatedAt: input.failedAt,
        });
      }

      const sourceStates = await transaction
        .select({
          status: ingestionRunSources.status,
          fetchedCount: ingestionRunSources.fetchedCount,
          newCount: ingestionRunSources.newCount,
        })
        .from(ingestionRunSources)
        .where(eq(ingestionRunSources.runId, input.runId));
      const aggregate = aggregateRun(sourceStates, input.failedAt);
      await transaction
        .update(ingestionRuns)
        .set({ ...aggregate, updatedAt: input.failedAt })
        .where(eq(ingestionRuns.id, input.runId));
    });
  }
}

export function aggregateRun(
  sources: ReadonlyArray<{
    status: string;
    fetchedCount: number;
    newCount: number;
  }>,
  completedAt: Date,
) {
  const terminal = sources.every(({ status }) =>
    ['succeeded', 'failed', 'skipped'].includes(status),
  );
  const failed = sources.filter(({ status }) => status === 'failed').length;
  const succeeded = sources.filter(
    ({ status }) => status === 'succeeded',
  ).length;
  const fetchedCount = sources.reduce(
    (sum, source) => sum + source.fetchedCount,
    0,
  );
  const newCount = sources.reduce((sum, source) => sum + source.newCount, 0);

  return {
    status: terminal
      ? failed === 0
        ? ('succeeded' as const)
        : succeeded > 0
          ? ('partial' as const)
          : ('failed' as const)
      : ('running' as const),
    finishedAt: terminal ? completedAt : null,
    fetchedCount,
    newCount,
    duplicateCount: Math.max(0, fetchedCount - newCount),
    errorCount: failed,
    errorSummary: failed > 0 ? `${failed} source(s) failed` : null,
  };
}
