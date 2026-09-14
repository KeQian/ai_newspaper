import { and, count, eq, gte, isNull, lt, min, or } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  ingestionRuns,
  newsletterDeliveries,
  newsletterEmailEvents,
  outboxEvents,
  sourceFeeds,
} from '@/db/schema';

import type { OperationsRepository, OperationsSnapshot } from './types';

export class DrizzleOperationsRepository implements OperationsRepository {
  constructor(private readonly database: Database) {}

  async snapshot(now: Date): Promise<OperationsSnapshot> {
    const last24h = new Date(now.getTime() - 24 * 60 * 60_000);
    const staleCoreCutoff = new Date(now.getTime() - 2 * 60 * 60_000);
    const [
      running,
      failed,
      partial,
      failingSources,
      staleCore,
      pendingOutbox,
      failedOutbox,
      newsletterFailed,
      complained,
    ] = await Promise.all([
      this.database
        .select({ value: count() })
        .from(ingestionRuns)
        .where(eq(ingestionRuns.status, 'running')),
      this.database
        .select({ value: count() })
        .from(ingestionRuns)
        .where(
          and(
            eq(ingestionRuns.status, 'failed'),
            gte(ingestionRuns.scheduledAt, last24h),
          ),
        ),
      this.database
        .select({ value: count() })
        .from(ingestionRuns)
        .where(
          and(
            eq(ingestionRuns.status, 'partial'),
            gte(ingestionRuns.scheduledAt, last24h),
          ),
        ),
      this.database
        .select({ value: count() })
        .from(sourceFeeds)
        .where(
          and(eq(sourceFeeds.enabled, true), gte(sourceFeeds.failureCount, 3)),
        ),
      this.database
        .select({ value: count() })
        .from(sourceFeeds)
        .where(
          and(
            eq(sourceFeeds.enabled, true),
            eq(sourceFeeds.reliability, 's0'),
            or(
              lt(sourceFeeds.lastSuccessAt, staleCoreCutoff),
              isNull(sourceFeeds.lastSuccessAt),
            ),
          ),
        ),
      this.database
        .select({ value: count(), oldest: min(outboxEvents.availableAt) })
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'pending')),
      this.database
        .select({ value: count() })
        .from(outboxEvents)
        .where(eq(outboxEvents.status, 'failed')),
      this.database
        .select({ value: count() })
        .from(newsletterDeliveries)
        .where(
          and(
            eq(newsletterDeliveries.status, 'failed'),
            gte(newsletterDeliveries.updatedAt, last24h),
          ),
        ),
      this.database
        .select({ value: count() })
        .from(newsletterEmailEvents)
        .where(
          and(
            eq(newsletterEmailEvents.eventType, 'complained'),
            gte(newsletterEmailEvents.occurredAt, last24h),
          ),
        ),
    ]);
    return {
      checkedAt: now,
      databaseReady: true,
      ingestion: {
        running: running[0]?.value ?? 0,
        failedLast24h: failed[0]?.value ?? 0,
        partialLast24h: partial[0]?.value ?? 0,
      },
      sources: {
        failing: failingSources[0]?.value ?? 0,
        staleCore: staleCore[0]?.value ?? 0,
      },
      outbox: {
        pending: pendingOutbox[0]?.value ?? 0,
        failed: failedOutbox[0]?.value ?? 0,
        oldestAvailableAt: pendingOutbox[0]?.oldest ?? null,
      },
      newsletter: {
        failedDeliveriesLast24h: newsletterFailed[0]?.value ?? 0,
        complainedLast24h: complained[0]?.value ?? 0,
      },
    };
  }
}
