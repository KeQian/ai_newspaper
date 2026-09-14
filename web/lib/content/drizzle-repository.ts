import { and, desc, eq, ilike, inArray, lt, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  adminUsers,
  auditLogs,
  candidateEvents,
  contentCandidateEvents,
  contentItems,
  contentRevisions,
  contentSources,
  contentTopics,
  correctionNotes,
  entities,
  entityAliases,
  outboxEvents,
  rawDocuments,
  sourceFeeds,
  searchDocuments,
} from '@/db/schema';

import {
  ContentConflictError,
  ContentNotFoundError,
  ContentValidationError,
  contentSlug,
  type ContentDraftInput,
  type ContentListQuery,
} from './model';
import type { ContentDetail, ContentRepository, ContentSummary } from './types';

// Drizzle's callback transaction type is intentionally erased here: expanding
// the full Neon generic in every helper makes TypeScript analysis pathological.
// oxlint-disable-next-line typescript/no-explicit-any
type DatabaseTransaction = any;
type SourceSnapshot = {
  rawDocumentId: string;
  url: string;
  title: string;
  publisher: string;
  sourceType: typeof sourceFeeds.$inferSelect.sourceType;
  reliability: typeof sourceFeeds.$inferSelect.reliability;
  publishedAt: Date | null;
};

export class DrizzleContentRepository implements ContentRepository {
  constructor(private readonly database: Database) {}

  async list(query: ContentListQuery) {
    const conditions = [];
    if (query.status) conditions.push(eq(contentItems.status, query.status));
    if (query.type) conditions.push(eq(contentItems.contentType, query.type));
    if (query.q) conditions.push(ilike(contentItems.title, `%${query.q}%`));
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(
        or(
          lt(contentItems.updatedAt, cursor.updatedAt),
          and(
            eq(contentItems.updatedAt, cursor.updatedAt),
            lt(contentItems.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.database
      .select({
        id: contentItems.id,
        type: contentItems.contentType,
        title: contentItems.title,
        status: contentItems.status,
        authorName: adminUsers.displayName,
        updatedAt: contentItems.updatedAt,
        scheduledAt: contentItems.scheduledAt,
        publishedAt: contentItems.publishedAt,
        version: contentItems.currentRevision,
        sourceCount: sql<number>`(select count(*)::int from ${contentSources} cs where cs.content_id = "content_items"."id")`,
        weakestReliability: sql<
          string | null
        >`(select max(reliability::text) from ${contentSources} cs where cs.content_id = "content_items"."id")`,
      })
      .from(contentItems)
      .innerJoin(adminUsers, eq(contentItems.authorId, adminUsers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contentItems.updatedAt), desc(contentItems.id))
      .limit(query.limit + 1);
    return {
      items: rows
        .slice(0, query.limit)
        .map(({ sourceCount, weakestReliability, ...row }) => ({
          ...row,
          sourceHealth:
            sourceCount === 0
              ? ('missing' as const)
              : weakestReliability && ['s3', 's4'].includes(weakestReliability)
                ? ('warning' as const)
                : ('healthy' as const),
        })),
      hasMore: rows.length > query.limit,
    };
  }

  async get(id: string): Promise<ContentDetail | null> {
    const [row] = await this.database
      .select({
        id: contentItems.id,
        type: contentItems.contentType,
        slug: contentItems.slug,
        title: contentItems.title,
        dek: contentItems.dek,
        summary: contentItems.summary,
        body: contentItems.body,
        status: contentItems.status,
        verification: contentItems.verification,
        importance: contentItems.importance,
        actionability: contentItems.actionability,
        authorName: adminUsers.displayName,
        seo: contentItems.seo,
        aiDisclosure: contentItems.aiDisclosure,
        withdrawalReason: contentItems.withdrawalReason,
        updatedAt: contentItems.updatedAt,
        scheduledAt: contentItems.scheduledAt,
        publishedAt: contentItems.publishedAt,
        version: contentItems.currentRevision,
      })
      .from(contentItems)
      .innerJoin(adminUsers, eq(contentItems.authorId, adminUsers.id))
      .where(eq(contentItems.id, id))
      .limit(1);
    if (!row) return null;
    const [sources, topicRows, revisions, corrections] = await Promise.all([
      this.database
        .select({
          id: contentSources.id,
          rawDocumentId: contentSources.rawDocumentId,
          title: contentSources.title,
          publisher: contentSources.publisher,
          url: contentSources.url,
          reliability: contentSources.reliability,
          relation: contentSources.relation,
        })
        .from(contentSources)
        .where(eq(contentSources.contentId, id)),
      this.database
        .select({ id: contentTopics.entityId })
        .from(contentTopics)
        .where(eq(contentTopics.contentId, id)),
      this.database
        .select({
          revision: contentRevisions.revision,
          changeSummary: contentRevisions.changeSummary,
          authorName: adminUsers.displayName,
          createdAt: contentRevisions.createdAt,
        })
        .from(contentRevisions)
        .innerJoin(adminUsers, eq(contentRevisions.createdBy, adminUsers.id))
        .where(eq(contentRevisions.contentId, id))
        .orderBy(desc(contentRevisions.revision)),
      this.database
        .select({
          description: correctionNotes.description,
          authorName: adminUsers.displayName,
          correctedAt: correctionNotes.correctedAt,
        })
        .from(correctionNotes)
        .innerJoin(adminUsers, eq(correctionNotes.createdBy, adminUsers.id))
        .where(eq(correctionNotes.contentId, id))
        .orderBy(desc(correctionNotes.correctedAt)),
    ]);
    return {
      ...row,
      sourceHealth: sourceHealth(sources),
      sources,
      topicIds: topicRows.map(({ id: topicId }) => topicId),
      revisions,
      corrections,
    };
  }

  async create(input: Parameters<ContentRepository['create']>[0]) {
    return this.database.transaction(
      async (transaction: DatabaseTransaction) => {
        const id = crypto.randomUUID();
        const sources = await sourceSnapshots(
          transaction,
          input.draft.sourceIds,
        );
        await validateTopics(transaction, input.draft.topicIds);
        const [created] = await transaction
          .insert(contentItems)
          .values({
            id,
            contentType: input.draft.type,
            slug: contentSlug(input.draft.title, id),
            status: 'draft',
            verification: input.draft.verification,
            title: input.draft.title,
            dek: input.draft.dek,
            summary: input.draft.summary,
            body: input.draft.body,
            importance: input.draft.importance,
            actionability: input.draft.actionability,
            authorId: input.actorId,
            aiDisclosure: input.draft.aiDisclosure,
            seo: input.draft.seo,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning({
            id: contentItems.id,
            status: contentItems.status,
            version: contentItems.currentRevision,
          });
        await saveRelations(
          transaction,
          id,
          input.draft.topicIds,
          sources,
          input.now,
        );
        await saveRevision(
          transaction,
          id,
          1,
          input.draft,
          input.actorId,
          input.now,
        );
        await saveAudit(transaction, {
          actorId: input.actorId,
          action: 'content.create',
          id,
          before: null,
          after: { status: 'draft', version: 1 },
          requestId: input.requestId,
          now: input.now,
        });
        return created;
      },
    );
  }

  async update(input: Parameters<ContentRepository['update']>[0]) {
    return this.database.transaction(
      async (transaction: DatabaseTransaction) => {
        const before = await lockContent(transaction, input.id);
        ensureVersion(before.currentRevision, input.draft.version);
        if (!['draft', 'in_review'].includes(before.status))
          throw new ContentValidationError(
            'Published or scheduled content must use a dedicated action',
          );
        const sources = await sourceSnapshots(
          transaction,
          input.draft.sourceIds,
        );
        await validateTopics(transaction, input.draft.topicIds);
        const version = before.currentRevision + 1;
        const [updated] = await transaction
          .update(contentItems)
          .set({
            contentType: input.draft.type,
            title: input.draft.title,
            dek: input.draft.dek,
            summary: input.draft.summary,
            body: input.draft.body,
            verification: input.draft.verification,
            importance: input.draft.importance,
            actionability: input.draft.actionability,
            seo: input.draft.seo,
            aiDisclosure: input.draft.aiDisclosure,
            currentRevision: version,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(contentItems.id, input.id),
              eq(contentItems.currentRevision, input.draft.version),
            ),
          )
          .returning({
            id: contentItems.id,
            status: contentItems.status,
            version: contentItems.currentRevision,
          });
        if (!updated) throw new ContentConflictError();
        await transaction
          .delete(contentSources)
          .where(eq(contentSources.contentId, input.id));
        await transaction
          .delete(contentTopics)
          .where(eq(contentTopics.contentId, input.id));
        await saveRelations(
          transaction,
          input.id,
          input.draft.topicIds,
          sources,
          input.now,
        );
        await saveRevision(
          transaction,
          input.id,
          version,
          input.draft,
          input.actorId,
          input.now,
        );
        await saveAudit(transaction, {
          actorId: input.actorId,
          action: 'content.update',
          id: input.id,
          before: { status: before.status, version: before.currentRevision },
          after: { status: updated.status, version },
          requestId: input.requestId,
          now: input.now,
        });
        return updated;
      },
    );
  }

  async transition(input: Parameters<ContentRepository['transition']>[0]) {
    return this.database.transaction(
      async (transaction: DatabaseTransaction) => {
        const before = await lockContent(transaction, input.id);
        ensureVersion(before.currentRevision, input.action.version);
        let status = before.status;
        let scheduledAt = before.scheduledAt;
        let publishedAt = before.publishedAt;
        let withdrawalReason = before.withdrawalReason;
        if (input.action.type === 'submit_review') {
          if (before.status !== 'draft')
            throw new ContentValidationError('Only drafts can enter review');
          status = 'in_review';
        } else if (input.action.type === 'publish') {
          if (!['in_review', 'scheduled'].includes(before.status))
            throw new ContentValidationError(
              'Content must be reviewed before publishing',
            );
          const issues = await publishIssues(transaction, before);
          if (issues.length)
            throw new ContentValidationError(
              'Publication checks failed',
              issues,
            );
          if (
            input.action.scheduledAt &&
            input.action.scheduledAt > input.now
          ) {
            status = 'scheduled';
            scheduledAt = input.action.scheduledAt;
          } else {
            status = before.publishedAt ? 'updated' : 'published';
            publishedAt = before.publishedAt ?? input.now;
            scheduledAt = null;
          }
        } else if (input.action.type === 'cancel_schedule') {
          if (before.status !== 'scheduled')
            throw new ContentValidationError('Content is not scheduled');
          status = 'in_review';
          scheduledAt = null;
        } else {
          if (!['published', 'updated'].includes(before.status))
            throw new ContentValidationError(
              'Only public content can be withdrawn',
            );
          status = 'withdrawn';
          withdrawalReason = input.action.reason;
          scheduledAt = null;
        }
        const [updated] = await transaction
          .update(contentItems)
          .set({
            status,
            scheduledAt,
            publishedAt,
            withdrawalReason,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(contentItems.id, input.id),
              eq(contentItems.currentRevision, input.action.version),
            ),
          )
          .returning({
            id: contentItems.id,
            status: contentItems.status,
            version: contentItems.currentRevision,
          });
        if (!updated) throw new ContentConflictError();
        if (input.action.type === 'publish' && status !== 'scheduled') {
          await transaction
            .update(candidateEvents)
            .set({ status: 'published', updatedAt: input.now })
            .where(
              sql`${candidateEvents.id} in (select candidate_event_id from ${contentCandidateEvents} where content_id = ${input.id})`,
            );
        }
        if (
          (input.action.type === 'publish' && status !== 'scheduled') ||
          input.action.type === 'withdraw'
        ) {
          if (status === 'withdrawn')
            await transaction
              .delete(searchDocuments)
              .where(eq(searchDocuments.contentId, input.id));
          else
            await upsertSearchProjection(
              transaction,
              {
                id: input.id,
                type: before.contentType,
                title: before.title,
                summary: before.summary,
                body: before.body,
                publishedAt: publishedAt!,
              },
              input.now,
            );
          await queueRefresh(transaction, input.id, status, input.now);
        }
        await saveAudit(transaction, {
          actorId: input.actorId,
          action: `content.${input.action.type}`,
          id: input.id,
          before: { status: before.status, version: before.currentRevision },
          after: {
            status,
            version: before.currentRevision,
            scheduledAt,
            publishedAt,
            withdrawalReason,
          },
          requestId: input.requestId,
          now: input.now,
        });
        return updated;
      },
    );
  }

  async correct(input: Parameters<ContentRepository['correct']>[0]) {
    return this.database.transaction(
      async (transaction: DatabaseTransaction) => {
        const before = await lockContent(transaction, input.id);
        ensureVersion(before.currentRevision, input.correction.version);
        if (!['published', 'updated'].includes(before.status))
          throw new ContentValidationError(
            'Only public content can be corrected',
          );
        const sources = await sourceSnapshots(
          transaction,
          input.correction.sourceIds,
        );
        await validateTopics(transaction, input.correction.topicIds);
        const version = before.currentRevision + 1;
        const [updated] = await transaction
          .update(contentItems)
          .set({
            contentType: input.correction.type,
            title: input.correction.title,
            dek: input.correction.dek,
            summary: input.correction.summary,
            body: input.correction.body,
            verification: input.correction.verification,
            importance: input.correction.importance,
            actionability: input.correction.actionability,
            seo: input.correction.seo,
            aiDisclosure: input.correction.aiDisclosure,
            status: 'updated',
            currentRevision: version,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(contentItems.id, input.id),
              eq(contentItems.currentRevision, input.correction.version),
            ),
          )
          .returning({
            id: contentItems.id,
            status: contentItems.status,
            version: contentItems.currentRevision,
          });
        if (!updated) throw new ContentConflictError();
        await transaction
          .delete(contentSources)
          .where(eq(contentSources.contentId, input.id));
        await transaction
          .delete(contentTopics)
          .where(eq(contentTopics.contentId, input.id));
        await saveRelations(
          transaction,
          input.id,
          input.correction.topicIds,
          sources,
          input.now,
        );
        await saveRevision(
          transaction,
          input.id,
          version,
          input.correction,
          input.actorId,
          input.now,
        );
        await transaction.insert(correctionNotes).values({
          contentId: input.id,
          description: input.correction.correctionDescription,
          correctedAt: input.now,
          createdBy: input.actorId,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await upsertSearchProjection(
          transaction,
          {
            id: input.id,
            type: input.correction.type,
            title: input.correction.title,
            summary: input.correction.summary,
            body: input.correction.body,
            publishedAt: before.publishedAt!,
          },
          input.now,
        );
        await queueRefresh(transaction, input.id, 'updated', input.now);
        await saveAudit(transaction, {
          actorId: input.actorId,
          action: 'content.correct',
          id: input.id,
          before: { status: before.status, version: before.currentRevision },
          after: {
            status: 'updated',
            version,
            description: input.correction.correctionDescription,
          },
          requestId: input.requestId,
          now: input.now,
        });
        return updated;
      },
    );
  }
}

function encodeCursor(item: ContentSummary) {
  return btoa(`${item.updatedAt.toISOString()}|${item.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function nextContentCursor(items: ContentSummary[], hasMore: boolean) {
  return hasMore && items.length ? encodeCursor(items.at(-1)!) : null;
}

function decodeCursor(cursor: string) {
  try {
    const normalized = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const [date, id, ...extra] = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
    ).split('|');
    const updatedAt = new Date(date);
    if (
      extra.length ||
      Number.isNaN(updatedAt.getTime()) ||
      !/^[0-9a-f-]{36}$/i.test(id)
    )
      throw new Error();
    return { updatedAt, id };
  } catch {
    throw new ContentValidationError('Invalid cursor');
  }
}

async function lockContent(transaction: DatabaseTransaction, id: string) {
  const [row] = await transaction
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, id))
    .limit(1)
    .for('update');
  if (!row) throw new ContentNotFoundError();
  return row as typeof contentItems.$inferSelect;
}

function ensureVersion(current: number, supplied: number) {
  if (current !== supplied) throw new ContentConflictError();
}

async function sourceSnapshots(
  transaction: DatabaseTransaction,
  ids: string[],
): Promise<SourceSnapshot[]> {
  const uniqueIds = [...new Set(ids)];
  const rows = await transaction
    .select({
      rawDocumentId: rawDocuments.id,
      url: rawDocuments.canonicalUrl,
      title: rawDocuments.title,
      publisher: sourceFeeds.name,
      sourceType: sourceFeeds.sourceType,
      reliability: sourceFeeds.reliability,
      publishedAt: rawDocuments.publishedAt,
    })
    .from(rawDocuments)
    .innerJoin(sourceFeeds, eq(rawDocuments.sourceFeedId, sourceFeeds.id))
    .where(inArray(rawDocuments.id, uniqueIds));
  if (rows.length !== uniqueIds.length)
    throw new ContentValidationError('One or more sources are unavailable');
  return rows as SourceSnapshot[];
}

async function validateTopics(transaction: DatabaseTransaction, ids: string[]) {
  if (!ids.length) return;
  const rows = await transaction
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        inArray(entities.id, [...new Set(ids)]),
        eq(entities.entityType, 'topic'),
      ),
    );
  if (rows.length !== new Set(ids).size)
    throw new ContentValidationError('Invalid topic selection');
}

async function saveRelations(
  transaction: DatabaseTransaction,
  contentId: string,
  topicIds: string[],
  sources: Awaited<ReturnType<typeof sourceSnapshots>>,
  now: Date,
) {
  await transaction.insert(contentSources).values(
    sources.map((source, index) => ({
      contentId,
      ...source,
      accessedAt: now,
      relation: index === 0 ? ('primary' as const) : ('corroborating' as const),
      createdAt: now,
      updatedAt: now,
    })),
  );
  if (topicIds.length)
    await transaction.insert(contentTopics).values(
      [...new Set(topicIds)].map((entityId) => ({
        contentId,
        entityId,
        createdAt: now,
        updatedAt: now,
      })),
    );
}

async function saveRevision(
  transaction: DatabaseTransaction,
  contentId: string,
  revision: number,
  draft: ContentDraftInput,
  actorId: string,
  now: Date,
) {
  await transaction.insert(contentRevisions).values({
    contentId,
    revision,
    snapshot: { ...draft, version: undefined, changeSummary: undefined },
    changeSummary: draft.changeSummary,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
}

async function publishIssues(
  transaction: DatabaseTransaction,
  content: typeof contentItems.$inferSelect,
) {
  const issues: string[] = [];
  if (!content.title.trim()) issues.push('标题不能为空');
  if (!content.summary.trim()) issues.push('摘要不能为空');
  const sources = await transaction
    .select({ reliability: contentSources.reliability })
    .from(contentSources)
    .where(eq(contentSources.contentId, content.id));
  if (!sources.length) issues.push('至少需要一个来源');
  if (
    content.importance >= 4 &&
    sources.length < 2 &&
    !sources.some(
      (source: { reliability: string }) => source.reliability === 's0',
    )
  )
    issues.push('高影响内容需要两个独立来源，或一个 S0 官方来源');
  const topics = await transaction
    .select({ id: contentTopics.entityId })
    .from(contentTopics)
    .where(eq(contentTopics.contentId, content.id));
  if (!topics.length) issues.push('至少需要一个主题');
  const seo = content.seo as { title?: unknown; description?: unknown };
  if (typeof seo.title !== 'string' || typeof seo.description !== 'string')
    issues.push('SEO 标题和描述不能为空');
  const body = content.body as { content?: Array<{ type?: string }> };
  if (!body.content?.length) issues.push('正文不能为空');
  if (body.content?.some((block) => block.type === 'image'))
    issues.push('图片发布需要完成版权和署名审核');
  return issues;
}

async function queueRefresh(
  transaction: DatabaseTransaction,
  contentId: string,
  status: string,
  now: Date,
) {
  await transaction.insert(outboxEvents).values({
    eventType: 'content.refresh',
    payload: {
      contentId,
      status,
      targets: ['cache', 'search', 'rss', 'sitemap'],
    },
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertSearchProjection(
  transaction: DatabaseTransaction,
  content: {
    id: string;
    type: 'news' | 'briefing' | 'analysis';
    title: string;
    summary: string;
    body: Record<string, unknown>;
    publishedAt: Date;
  },
  now: Date,
) {
  const names = await transaction
    .select({
      canonicalName: entities.canonicalName,
      nameZh: entities.nameZh,
      nameEn: entities.nameEn,
      alias: entityAliases.alias,
    })
    .from(contentTopics)
    .innerJoin(entities, eq(contentTopics.entityId, entities.id))
    .leftJoin(entityAliases, eq(entityAliases.entityId, entities.id))
    .where(eq(contentTopics.contentId, content.id));
  const entityText = [
    ...new Set(
      names.flatMap(
        ({
          canonicalName,
          nameZh,
          nameEn,
          alias,
        }: {
          canonicalName: string;
          nameZh: string | null;
          nameEn: string | null;
          alias: string | null;
        }) => [canonicalName, nameZh, nameEn, alias].filter(isText),
      ),
    ),
  ].join(' ');
  const bodyText = searchableBodyText(content.body);
  const projection = {
    contentId: content.id,
    contentType: content.type,
    title: content.title,
    summary: content.summary,
    bodyText,
    entityText,
    searchText: [content.title, content.summary, bodyText, entityText].join(
      ' ',
    ),
    publishedAt: content.publishedAt,
    updatedAt: now,
  };
  await transaction
    .insert(searchDocuments)
    .values({ ...projection, createdAt: now })
    .onConflictDoUpdate({
      target: searchDocuments.contentId,
      set: projection,
    });
}

function searchableBodyText(value: unknown, key = ''): string {
  if (typeof value === 'string')
    return ['type', 'mediaId', 'sourceId', 'href', 'id', 'tone'].includes(key)
      ? ''
      : value;
  if (Array.isArray(value))
    return value.map((item) => searchableBodyText(item)).join(' ');
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .map(([childKey, child]) => searchableBodyText(child, childKey))
    .join(' ');
}

function isText(value: string | null): value is string {
  return Boolean(value);
}

async function saveAudit(
  transaction: DatabaseTransaction,
  input: {
    actorId: string;
    action: string;
    id: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    requestId: string;
    now: Date;
  },
) {
  await transaction.insert(auditLogs).values({
    actorId: input.actorId,
    action: input.action,
    objectType: 'content_item',
    objectId: input.id,
    before: input.before,
    after: input.after,
    requestId: input.requestId,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function sourceHealth(
  sources: Array<{ reliability: string }>,
): ContentSummary['sourceHealth'] {
  if (!sources.length) return 'missing';
  return sources.some(({ reliability }) => ['s3', 's4'].includes(reliability))
    ? 'warning'
    : 'healthy';
}
