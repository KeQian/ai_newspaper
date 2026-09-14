import { and, eq, inArray, lt, lte, max, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  automationJobLeases,
  ingestionRuns,
  ingestionRunSources,
  sourceFeeds,
} from '@/db/schema';
import { aggregateRun } from '@/lib/ingestion/connectors/drizzle-connector-repository';

import type { AutomationJobDefinition } from './model';
import type { AutomationRepository, AutomationSource } from './types';

export class DrizzleAutomationRepository implements AutomationRepository {
  constructor(private readonly database: Database) {}

  async acquireLease(input: {
    jobKey: string;
    holderId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    const rows = await this.database
      .insert(automationJobLeases)
      .values({
        jobKey: input.jobKey,
        holderId: input.holderId,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: automationJobLeases.jobKey,
        set: {
          holderId: input.holderId,
          expiresAt: input.expiresAt,
          updatedAt: input.now,
        },
        setWhere: or(
          lte(automationJobLeases.expiresAt, input.now),
          eq(automationJobLeases.holderId, input.holderId),
        ),
      })
      .returning({ jobKey: automationJobLeases.jobKey });
    return rows.length === 1;
  }

  async releaseLease(jobKey: string, holderId: string): Promise<void> {
    await this.database
      .delete(automationJobLeases)
      .where(
        and(
          eq(automationJobLeases.jobKey, jobKey),
          eq(automationJobLeases.holderId, holderId),
        ),
      );
  }

  async recoverStaleSources(cutoff: Date, now: Date): Promise<number> {
    return this.database.transaction(async (transaction) => {
      const stale = await transaction
        .update(ingestionRunSources)
        .set({
          status: 'failed',
          cursorAfter: null,
          errorCode: 'SOURCE_LEASE_EXPIRED',
          errorDetail: 'Previous worker exceeded its execution lease.',
          updatedAt: now,
        })
        .where(
          and(
            eq(ingestionRunSources.status, 'running'),
            lt(ingestionRunSources.updatedAt, cutoff),
          ),
        )
        .returning({ runId: ingestionRunSources.runId });

      const runIds = [...new Set(stale.map(({ runId }) => runId))];
      for (const runId of runIds) {
        const sourceStates = await transaction
          .select({
            status: ingestionRunSources.status,
            fetchedCount: ingestionRunSources.fetchedCount,
            newCount: ingestionRunSources.newCount,
          })
          .from(ingestionRunSources)
          .where(eq(ingestionRunSources.runId, runId));
        await transaction
          .update(ingestionRuns)
          .set({ ...aggregateRun(sourceStates, now), updatedAt: now })
          .where(eq(ingestionRuns.id, runId));
      }
      return stale.length;
    });
  }

  async latestScheduledAt(jobKey: string): Promise<Date | null> {
    const [row] = await this.database
      .select({ scheduledAt: max(ingestionRuns.scheduledAt) })
      .from(ingestionRuns)
      .where(eq(ingestionRuns.jobKey, jobKey));
    return row?.scheduledAt ?? null;
  }

  async listEligibleSources(
    definition: AutomationJobDefinition,
  ): Promise<AutomationSource[]> {
    const category = sql<string>`${sourceFeeds.config}->>'category'`;
    return this.database
      .select({ key: sourceFeeds.key, schedule: sourceFeeds.schedule })
      .from(sourceFeeds)
      .where(
        and(
          eq(sourceFeeds.enabled, true),
          eq(sourceFeeds.termsStatus, 'approved'),
          inArray(category, [...definition.categories]),
        ),
      )
      .orderBy(sourceFeeds.key);
  }
}
