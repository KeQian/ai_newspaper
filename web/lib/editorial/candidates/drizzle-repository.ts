import { and, asc, desc, eq, gt, ilike, lt, lte, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  auditLogs,
  candidateEntitySuggestions,
  candidateEventDocuments,
  candidateEventEntities,
  candidateEvents,
  candidateMergeSuggestions,
  contentCandidateEvents,
  contentItems,
  contentRevisions,
  contentSources,
  entities,
  rawDocuments,
  sourceFeeds,
} from '@/db/schema';

import {
  CandidateConflictError,
  CandidateDecisionError,
  CandidateNotFoundError,
  decodeCandidateCursor,
  draftSlug,
  type CandidateListQuery,
} from './model';
import type {
  CandidateDetail,
  CandidateListItem,
  EditorialCandidateRepository,
} from './types';

export class DrizzleEditorialCandidateRepository implements EditorialCandidateRepository {
  constructor(private readonly database: Database) {}

  async list(query: CandidateListQuery, now: Date) {
    const conditions = [];
    if (query.status) conditions.push(eq(candidateEvents.status, query.status));
    if (query.verification)
      conditions.push(eq(candidateEvents.verification, query.verification));
    if (query.importance)
      conditions.push(eq(candidateEvents.importance, query.importance));
    if (query.risk)
      conditions.push(sql`${query.risk} = any(${candidateEvents.riskFlags})`);
    if (query.q)
      conditions.push(
        or(
          ilike(candidateEvents.title, `%${query.q}%`),
          ilike(candidateEvents.factSummary, `%${query.q}%`),
        )!,
      );
    if (query.from) conditions.push(gt(candidateEvents.createdAt, query.from));
    if (query.to) conditions.push(lte(candidateEvents.createdAt, query.to));
    if (!query.includeDeferred)
      conditions.push(
        or(
          sql`${candidateEvents.deferredUntil} is null`,
          lte(candidateEvents.deferredUntil, now),
        )!,
      );
    if (query.source)
      conditions.push(sql`exists (
        select 1 from ${candidateEventDocuments} ced
        join ${rawDocuments} rd on rd.id = ced.raw_document_id
        join ${sourceFeeds} sf on sf.id = rd.source_feed_id
        where ced.event_id = ${candidateEvents.id}
        and sf.name ilike ${`%${query.source}%`}
      )`);
    if (query.entity) conditions.push(entityFilter(query.entity, false));
    if (query.topic) conditions.push(entityFilter(query.topic, true));
    if (query.cursor) {
      const cursor = decodeCandidateCursor(query.cursor);
      conditions.push(
        or(
          lt(candidateEvents.createdAt, cursor.createdAt),
          and(
            eq(candidateEvents.createdAt, cursor.createdAt),
            lt(candidateEvents.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.database
      .select({
        id: candidateEvents.id,
        title: candidateEvents.title,
        factSummary: candidateEvents.factSummary,
        occurredAt: candidateEvents.occurredAt,
        status: candidateEvents.status,
        verification: candidateEvents.verification,
        importance: candidateEvents.importance,
        actionability: candidateEvents.actionability,
        confidence: candidateEvents.confidence,
        riskFlags: candidateEvents.riskFlags,
        deferredUntil: candidateEvents.deferredUntil,
        createdAt: candidateEvents.createdAt,
        version: candidateEvents.version,
        sourceCount: sql<number>`(
          select count(*)::int from ${candidateEventDocuments} ced
          where ced.event_id = "candidate_events"."id"
        )`,
        primarySource: sql<string | null>`(
          select sf.name from ${candidateEventDocuments} ced
          join ${rawDocuments} rd on rd.id = ced.raw_document_id
          join ${sourceFeeds} sf on sf.id = rd.source_feed_id
          where ced.event_id = "candidate_events"."id"
          order by case when ced.relation = 'primary' then 0 else 1 end, sf.name
          limit 1
        )`,
      })
      .from(candidateEvents)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(candidateEvents.createdAt), desc(candidateEvents.id))
      .limit(query.limit + 1);

    return {
      items: rows.slice(0, query.limit).map(serializeListItem),
      hasMore: rows.length > query.limit,
    };
  }

  async get(id: string): Promise<CandidateDetail | null> {
    const [row] = await this.database
      .select({
        id: candidateEvents.id,
        title: candidateEvents.title,
        factSummary: candidateEvents.factSummary,
        occurredAt: candidateEvents.occurredAt,
        status: candidateEvents.status,
        verification: candidateEvents.verification,
        importance: candidateEvents.importance,
        actionability: candidateEvents.actionability,
        novelty: candidateEvents.novelty,
        confidence: candidateEvents.confidence,
        riskFlags: candidateEvents.riskFlags,
        deferredUntil: candidateEvents.deferredUntil,
        modelInfo: candidateEvents.modelInfo,
        createdAt: candidateEvents.createdAt,
        version: candidateEvents.version,
      })
      .from(candidateEvents)
      .where(eq(candidateEvents.id, id))
      .limit(1);
    if (!row) return null;

    const [documents, entityRows, suggestionRows, mergeRows] =
      await Promise.all([
        this.database
          .select({
            id: rawDocuments.id,
            title: rawDocuments.title,
            url: rawDocuments.canonicalUrl,
            excerpt: rawDocuments.allowedExcerpt,
            publisher: sourceFeeds.name,
            reliability: sourceFeeds.reliability,
            relation: candidateEventDocuments.relation,
            publishedAt: rawDocuments.publishedAt,
          })
          .from(candidateEventDocuments)
          .innerJoin(
            rawDocuments,
            eq(candidateEventDocuments.rawDocumentId, rawDocuments.id),
          )
          .innerJoin(sourceFeeds, eq(rawDocuments.sourceFeedId, sourceFeeds.id))
          .where(eq(candidateEventDocuments.eventId, id))
          .orderBy(asc(candidateEventDocuments.createdAt)),
        this.database
          .select({
            id: entities.id,
            name: entities.canonicalName,
            type: entities.entityType,
            confidence: candidateEventEntities.confidence,
            confirmed: candidateEventEntities.confirmedByEditor,
          })
          .from(candidateEventEntities)
          .innerJoin(entities, eq(candidateEventEntities.entityId, entities.id))
          .where(eq(candidateEventEntities.eventId, id)),
        this.database
          .select({
            id: candidateEntitySuggestions.id,
            name: candidateEntitySuggestions.name,
            type: candidateEntitySuggestions.entityType,
            confidence: candidateEntitySuggestions.confidence,
            status: candidateEntitySuggestions.status,
          })
          .from(candidateEntitySuggestions)
          .where(eq(candidateEntitySuggestions.eventId, id)),
        this.database
          .select({
            targetId: candidateMergeSuggestions.targetEventId,
            title: candidateEvents.title,
            score: candidateMergeSuggestions.score,
            reasons: candidateMergeSuggestions.reasons,
            status: candidateMergeSuggestions.status,
          })
          .from(candidateMergeSuggestions)
          .innerJoin(
            candidateEvents,
            eq(candidateMergeSuggestions.targetEventId, candidateEvents.id),
          )
          .where(eq(candidateMergeSuggestions.candidateId, id))
          .orderBy(desc(candidateMergeSuggestions.score)),
      ]);

    return {
      ...serializeListItem({
        ...row,
        sourceCount: documents.length,
        primarySource: documents.at(0)?.publisher ?? null,
      }),
      novelty: row.novelty,
      modelInfo: row.modelInfo,
      documents,
      entities: entityRows.map((item) => ({
        ...item,
        confidence: Number(item.confidence),
      })),
      entitySuggestions: suggestionRows.map((item) => ({
        ...item,
        confidence: Number(item.confidence),
      })),
      mergeSuggestions: mergeRows.map((item) => ({
        ...item,
        score: Number(item.score),
      })),
    };
  }

  async decide(input: Parameters<EditorialCandidateRepository['decide']>[0]) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select()
        .from(candidateEvents)
        .where(eq(candidateEvents.id, input.id))
        .limit(1)
        .for('update');
      if (!before) throw new CandidateNotFoundError();
      if (before.version !== input.decision.version)
        throw new CandidateConflictError();
      if (!['new', 'review'].includes(before.status))
        throw new CandidateDecisionError(
          `Candidate in ${before.status} cannot be decided`,
        );

      let draftId: string | undefined;
      let nextStatus = before.status;
      let mergedIntoId: string | null = before.mergedIntoId;
      let deferredUntil: Date | null = before.deferredUntil;

      if (input.decision.action === 'reject') {
        nextStatus = 'rejected';
        deferredUntil = null;
      }
      if (input.decision.action === 'defer') {
        deferredUntil = new Date(input.now.getTime() + 24 * 60 * 60 * 1000);
      }
      if (input.decision.action === 'merge') {
        const [target] = await transaction
          .select({ id: candidateEvents.id, status: candidateEvents.status })
          .from(candidateEvents)
          .where(eq(candidateEvents.id, input.decision.targetId))
          .limit(1)
          .for('update');
        if (!target || ['merged', 'rejected'].includes(target.status))
          throw new CandidateDecisionError('Merge target is unavailable');
        await transaction.execute(sql`
          insert into ${candidateEventDocuments}
            (event_id, raw_document_id, raw_content_hash, relation, created_at, updated_at)
          select ${target.id}, raw_document_id, raw_content_hash, relation, ${input.now}, ${input.now}
          from ${candidateEventDocuments} where event_id = ${input.id}
          on conflict (event_id, raw_document_id) do nothing
        `);
        await transaction.execute(sql`
          insert into ${candidateEventEntities}
            (event_id, entity_id, confidence, confirmed_by_editor, created_at, updated_at)
          select ${target.id}, entity_id, confidence, confirmed_by_editor, ${input.now}, ${input.now}
          from ${candidateEventEntities} where event_id = ${input.id}
          on conflict (event_id, entity_id) do nothing
        `);
        await transaction
          .update(candidateMergeSuggestions)
          .set({
            status: sql`case when ${candidateMergeSuggestions.targetEventId} = ${target.id} then 'accepted' else 'rejected' end`,
            updatedAt: input.now,
          })
          .where(eq(candidateMergeSuggestions.candidateId, input.id));
        nextStatus = 'merged';
        mergedIntoId = target.id;
        deferredUntil = null;
      }
      if (input.decision.action === 'create_draft') {
        const sources = await transaction
          .select({
            rawDocumentId: rawDocuments.id,
            url: rawDocuments.canonicalUrl,
            title: rawDocuments.title,
            publisher: sourceFeeds.name,
            sourceType: sourceFeeds.sourceType,
            reliability: sourceFeeds.reliability,
            publishedAt: rawDocuments.publishedAt,
            relation: candidateEventDocuments.relation,
          })
          .from(candidateEventDocuments)
          .innerJoin(
            rawDocuments,
            eq(candidateEventDocuments.rawDocumentId, rawDocuments.id),
          )
          .innerJoin(sourceFeeds, eq(rawDocuments.sourceFeedId, sourceFeeds.id))
          .where(eq(candidateEventDocuments.eventId, input.id));
        if (!sources.length)
          throw new CandidateDecisionError('Candidate has no source');
        const hasPrimaryOrOfficial = sources.some(
          (source) =>
            source.relation === 'primary' || source.reliability === 's0',
        );
        if (!hasPrimaryOrOfficial && !input.decision.reason)
          throw new CandidateDecisionError(
            'An exception reason is required without a primary or official source',
          );
        const existing = await transaction
          .select({ id: contentItems.id })
          .from(contentCandidateEvents)
          .innerJoin(
            contentItems,
            eq(contentCandidateEvents.contentId, contentItems.id),
          )
          .where(eq(contentCandidateEvents.candidateEventId, input.id))
          .limit(1);
        if (existing.length)
          throw new CandidateConflictError('A draft already exists');
        const body = {
          schemaVersion: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: before.factSummary }],
            },
          ],
        };
        const [draft] = await transaction
          .insert(contentItems)
          .values({
            contentType: 'news',
            slug: draftSlug(before.title, before.id),
            status: 'draft',
            verification: before.verification,
            title: before.title,
            dek: before.factSummary.slice(0, 280),
            summary: before.factSummary,
            body,
            importance: before.importance,
            actionability: before.actionability,
            authorId: input.actorId,
            aiDisclosure: {
              generatedFromCandidate: true,
              modelInfo: before.modelInfo,
            },
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning({ id: contentItems.id });
        draftId = draft.id;
        await transaction.insert(contentCandidateEvents).values({
          contentId: draftId,
          candidateEventId: input.id,
          createdAt: input.now,
          updatedAt: input.now,
        });
        await transaction.insert(contentSources).values(
          sources.map((source) => ({
            contentId: draftId!,
            ...source,
            accessedAt: input.now,
            createdAt: input.now,
            updatedAt: input.now,
          })),
        );
        await transaction.insert(contentRevisions).values({
          contentId: draftId,
          revision: 1,
          snapshot: {
            title: before.title,
            dek: before.factSummary.slice(0, 280),
            summary: before.factSummary,
            body,
          },
          changeSummary: '从候选事件创建初始草稿',
          createdBy: input.actorId,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }

      const [updated] = await transaction
        .update(candidateEvents)
        .set({
          status: nextStatus,
          mergedIntoId,
          deferredUntil,
          version: sql`${candidateEvents.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(candidateEvents.id, input.id),
            eq(candidateEvents.version, input.decision.version),
          ),
        )
        .returning({
          id: candidateEvents.id,
          status: candidateEvents.status,
          version: candidateEvents.version,
        });
      if (!updated) throw new CandidateConflictError();
      await transaction.insert(auditLogs).values({
        actorId: input.actorId,
        action: `candidate.${input.decision.action}`,
        objectType: 'candidate_event',
        objectId: input.id,
        before: {
          status: before.status,
          version: before.version,
          deferredUntil: before.deferredUntil?.toISOString() ?? null,
        },
        after: {
          status: updated.status,
          version: updated.version,
          deferredUntil: deferredUntil?.toISOString() ?? null,
          mergedIntoId,
          draftId,
          reason: input.decision.reason ?? null,
        },
        requestId: input.requestId,
        createdAt: input.now,
        updatedAt: input.now,
      });
      return { ...updated, draftId };
    });
  }
}

function entityFilter(value: string, topicOnly: boolean) {
  return sql`exists (
    select 1 from ${candidateEventEntities} cee
    join ${entities} e on e.id = cee.entity_id
    where cee.event_id = ${candidateEvents.id}
    and (${equalityOrName(value)})
    ${topicOnly ? sql`and e.entity_type = 'topic'` : sql``}
  )`;
}

function equalityOrName(value: string) {
  return sql`(e.id::text = ${value} or e.canonical_name ilike ${`%${value}%`})`;
}

function serializeListItem(row: {
  id: string;
  title: string;
  factSummary: string;
  occurredAt: Date | null;
  status: string;
  verification: string;
  importance: number;
  actionability: number;
  confidence: string;
  riskFlags: string[];
  sourceCount: number;
  primarySource: string | null;
  deferredUntil: Date | null;
  createdAt: Date;
  version: number;
}): CandidateListItem {
  return { ...row, confidence: Number(row.confidence) };
}
