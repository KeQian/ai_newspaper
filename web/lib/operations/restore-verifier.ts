import { count, eq, inArray } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  auditLogs,
  contentItems,
  newsletterSubscribers,
  sourceFeeds,
} from '@/db/schema';

export async function verifyRestoredDatabase(database: Database) {
  const [audits, publicContent, suppressed, sources] = await Promise.all([
    database.select({ value: count() }).from(auditLogs),
    database
      .select({ value: count() })
      .from(contentItems)
      .where(
        inArray(contentItems.status, ['published', 'updated', 'withdrawn']),
      ),
    database
      .select({ value: count() })
      .from(newsletterSubscribers)
      .where(
        inArray(newsletterSubscribers.status, [
          'unsubscribed',
          'bounced',
          'complained',
        ]),
      ),
    database
      .select({ value: count() })
      .from(sourceFeeds)
      .where(eq(sourceFeeds.enabled, true)),
  ]);
  return {
    ok: true,
    criticalCounts: {
      auditLogs: audits[0]?.value ?? 0,
      publicContent: publicContent[0]?.value ?? 0,
      suppressedSubscribers: suppressed[0]?.value ?? 0,
      enabledSources: sources[0]?.value ?? 0,
    },
  };
}
