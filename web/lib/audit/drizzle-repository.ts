import { and, desc, eq, gte, lt, lte, or, type SQL } from 'drizzle-orm';

import type { Database } from '@/db/client';
import { adminUsers, auditLogs } from '@/db/schema';

import type { AuditFilters, AuditRecord, AuditRepository } from './types';

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly database: Database) {}

  async list(input: AuditFilters): Promise<AuditRecord[]> {
    const filters: SQL[] = [];
    if (input.action) filters.push(eq(auditLogs.action, input.action));
    if (input.objectType)
      filters.push(eq(auditLogs.objectType, input.objectType));
    if (input.actorId) filters.push(eq(auditLogs.actorId, input.actorId));
    if (input.requestId) filters.push(eq(auditLogs.requestId, input.requestId));
    if (input.from) filters.push(gte(auditLogs.createdAt, input.from));
    if (input.to) filters.push(lte(auditLogs.createdAt, input.to));
    if (input.before) {
      filters.push(
        or(
          lt(auditLogs.createdAt, input.before.createdAt),
          and(
            eq(auditLogs.createdAt, input.before.createdAt),
            lt(auditLogs.id, input.before.id),
          ),
        )!,
      );
    }

    return this.database
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorName: adminUsers.displayName,
        action: auditLogs.action,
        objectType: auditLogs.objectType,
        objectId: auditLogs.objectId,
        before: auditLogs.before,
        after: auditLogs.after,
        requestId: auditLogs.requestId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(auditLogs.actorId, adminUsers.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.limit);
  }
}
