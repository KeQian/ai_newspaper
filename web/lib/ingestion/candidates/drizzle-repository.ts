import { and, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  candidateEntitySuggestions,
  candidateEventDocuments,
  candidateEventEntities,
  candidateEvents,
  candidateGenerationFailures,
  candidateMergeSuggestions,
  entities,
  entityAliases,
  ingestionRunDocuments,
  rawDocuments,
  sourceFeeds,
} from '@/db/schema';

import { normalizeEntityName } from './model';
import type {
  CandidateDocument,
  CandidateDocumentGroup,
  CandidateRepository,
  RecentCandidate,
} from './types';

export class DrizzleCandidateRepository implements CandidateRepository {
  constructor(private readonly database: Database) {}

  async listPendingGroups(
    runId: string,
    limit: number,
  ): Promise<CandidateDocumentGroup[]> {
    const observed = await this.database
      .select({
        id: rawDocuments.id,
        title: rawDocuments.title,
        allowedExcerpt: rawDocuments.allowedExcerpt,
        canonicalUrl: rawDocuments.canonicalUrl,
        publishedAt: rawDocuments.publishedAt,
        currentContentHash: rawDocuments.contentHash,
        observedContentHash: ingestionRunDocuments.observedContentHash,
        sourceName: sourceFeeds.name,
        sourceReliability: sourceFeeds.reliability,
      })
      .from(ingestionRunDocuments)
      .innerJoin(
        rawDocuments,
        eq(ingestionRunDocuments.rawDocumentId, rawDocuments.id),
      )
      .innerJoin(sourceFeeds, eq(rawDocuments.sourceFeedId, sourceFeeds.id))
      .where(eq(ingestionRunDocuments.runId, runId))
      .limit(Math.min(limit * 20, 2000));
    if (observed.length === 0) return [];

    const relations = await this.database
      .select({
        rawDocumentId: candidateEventDocuments.rawDocumentId,
        rawContentHash: candidateEventDocuments.rawContentHash,
      })
      .from(candidateEventDocuments)
      .where(
        inArray(
          candidateEventDocuments.rawDocumentId,
          observed.map(({ id }) => id),
        ),
      );
    const processed = new Set(
      relations.map(
        ({ rawDocumentId, rawContentHash }) =>
          `${rawDocumentId}:${rawContentHash}`,
      ),
    );
    const groups = new Map<string, CandidateDocument[]>();
    for (const row of observed) {
      if (
        row.currentContentHash !== row.observedContentHash ||
        processed.has(`${row.id}:${row.observedContentHash}`)
      ) {
        continue;
      }
      const documents = groups.get(row.observedContentHash) ?? [];
      documents.push({
        id: row.id,
        title: row.title,
        allowedExcerpt: row.allowedExcerpt,
        canonicalUrl: row.canonicalUrl,
        publishedAt: row.publishedAt,
        contentHash: row.observedContentHash,
        sourceName: row.sourceName,
        sourceReliability: row.sourceReliability,
      });
      groups.set(row.observedContentHash, documents);
    }
    return Array.from(groups, ([contentHash, documents]) => ({
      contentHash,
      documents,
    })).slice(0, limit);
  }

  async attachToExistingCandidate(input: {
    clusterKey: string;
    documents: readonly CandidateDocument[];
    now: Date;
  }): Promise<string | null> {
    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({ id: candidateEvents.id })
        .from(candidateEvents)
        .where(eq(candidateEvents.clusterKey, input.clusterKey))
        .limit(1);
      if (!candidate) return null;
      await attachDocuments(
        transaction,
        candidate.id,
        input.documents,
        new Map(),
        input.now,
      );
      await transaction
        .update(candidateGenerationFailures)
        .set({ status: 'resolved', updatedAt: input.now })
        .where(eq(candidateGenerationFailures.clusterKey, input.clusterKey));
      return candidate.id;
    });
  }

  async createCandidate(
    input: Parameters<CandidateRepository['createCandidate']>[0],
  ) {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(candidateEvents)
        .values({
          title: input.output.title,
          factSummary: input.output.factSummary,
          occurredAt: input.output.occurredAt
            ? new Date(input.output.occurredAt)
            : null,
          status: 'review',
          verification: input.output.verification,
          importance: input.output.scores.importance,
          actionability: input.output.scores.actionability,
          novelty: input.output.scores.novelty,
          confidence: String(input.output.scores.confidence),
          riskFlags: [...input.riskFlags],
          clusterKey: input.clusterKey,
          modelInfo: input.modelInfo,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning({ id: candidateEvents.id });
      const candidateId =
        created?.id ?? (await findCandidateId(transaction, input.clusterKey));
      const relations = new Map(
        input.output.sourceRelations.map(({ rawDocumentId, relation }) => [
          rawDocumentId,
          relation,
        ]),
      );
      await attachDocuments(
        transaction,
        candidateId,
        input.documents,
        relations,
        input.now,
      );
      if (created) {
        for (const suggestion of input.output.entities) {
          const normalizedName = normalizeEntityName(suggestion.name);
          const matchedEntityId = await findEntityId(
            transaction,
            suggestion.type,
            normalizedName,
          );
          await transaction.insert(candidateEntitySuggestions).values({
            eventId: candidateId,
            entityType: suggestion.type,
            name: suggestion.name,
            normalizedName,
            confidence: String(suggestion.confidence),
            matchedEntityId,
            status: matchedEntityId ? 'matched' : 'pending',
            createdAt: input.now,
            updatedAt: input.now,
          });
          if (matchedEntityId) {
            await transaction
              .insert(candidateEventEntities)
              .values({
                eventId: candidateId,
                entityId: matchedEntityId,
                confidence: String(suggestion.confidence),
                confirmedByEditor: false,
                createdAt: input.now,
                updatedAt: input.now,
              })
              .onConflictDoNothing();
          }
        }
      }
      await transaction
        .update(candidateGenerationFailures)
        .set({ status: 'resolved', updatedAt: input.now })
        .where(eq(candidateGenerationFailures.clusterKey, input.clusterKey));
      return { id: candidateId, created: Boolean(created) };
    });
  }

  async recordGenerationFailure(
    input: Parameters<CandidateRepository['recordGenerationFailure']>[0],
  ): Promise<void> {
    await this.database
      .insert(candidateGenerationFailures)
      .values({
        runId: input.runId,
        clusterKey: input.clusterKey,
        rawDocumentIds: [...input.rawDocumentIds],
        errorCode: input.errorCode,
        validationIssues: [...input.issues].slice(0, 20),
        attempts: input.attempts,
        modelInfo: input.modelInfo,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          candidateGenerationFailures.runId,
          candidateGenerationFailures.clusterKey,
        ],
        set: {
          rawDocumentIds: [...input.rawDocumentIds],
          errorCode: input.errorCode,
          validationIssues: [...input.issues].slice(0, 20),
          attempts: input.attempts,
          modelInfo: input.modelInfo,
          status: 'open',
          updatedAt: input.now,
        },
      });
  }

  async listRecentCandidates(input: {
    candidateId: string;
    occurredAt: Date | null;
    now: Date;
  }): Promise<RecentCandidate[]> {
    if (!input.occurredAt) return [];
    const distance = 72 * 60 * 60 * 1000;
    const candidates = await this.database
      .select({
        id: candidateEvents.id,
        title: candidateEvents.title,
        occurredAt: candidateEvents.occurredAt,
      })
      .from(candidateEvents)
      .where(
        and(
          ne(candidateEvents.id, input.candidateId),
          inArray(candidateEvents.status, [
            'new',
            'processing',
            'review',
            'published',
          ]),
          gte(
            candidateEvents.occurredAt,
            new Date(input.occurredAt.getTime() - distance),
          ),
          lte(
            candidateEvents.occurredAt,
            new Date(input.occurredAt.getTime() + distance),
          ),
        ),
      )
      .limit(100);
    if (candidates.length === 0) return [];
    const suggestions = await this.database
      .select({
        eventId: candidateEntitySuggestions.eventId,
        name: candidateEntitySuggestions.name,
      })
      .from(candidateEntitySuggestions)
      .where(
        inArray(
          candidateEntitySuggestions.eventId,
          candidates.map(({ id }) => id),
        ),
      );
    return candidates.map((candidate) => ({
      ...candidate,
      entityNames: suggestions
        .filter(({ eventId }) => eventId === candidate.id)
        .map(({ name }) => name),
    }));
  }

  async saveMergeSuggestions(
    input: Parameters<CandidateRepository['saveMergeSuggestions']>[0],
  ): Promise<void> {
    if (input.suggestions.length === 0) return;
    await this.database
      .insert(candidateMergeSuggestions)
      .values(
        input.suggestions.map((suggestion) => ({
          candidateId: input.candidateId,
          targetEventId: suggestion.targetEventId,
          method: 'rule_title_entity_time_v1',
          score: String(suggestion.score),
          reasons: suggestion.reasons,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      )
      .onConflictDoNothing();
  }
}

type CandidateTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

async function attachDocuments(
  transaction: CandidateTransaction,
  candidateId: string,
  documents: readonly CandidateDocument[],
  relations: ReadonlyMap<string, 'primary' | 'corroborating' | 'signal'>,
  now: Date,
): Promise<void> {
  await transaction
    .insert(candidateEventDocuments)
    .values(
      documents.map((document) => ({
        eventId: candidateId,
        rawDocumentId: document.id,
        rawContentHash: document.contentHash,
        relation: relations.get(document.id) ?? 'corroborating',
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        candidateEventDocuments.eventId,
        candidateEventDocuments.rawDocumentId,
      ],
      set: { rawContentHash: sql`excluded.raw_content_hash`, updatedAt: now },
    });
}

async function findCandidateId(
  transaction: CandidateTransaction,
  clusterKey: string,
): Promise<string> {
  const [candidate] = await transaction
    .select({ id: candidateEvents.id })
    .from(candidateEvents)
    .where(eq(candidateEvents.clusterKey, clusterKey))
    .limit(1);
  if (!candidate) throw new Error('Candidate persistence failed');
  return candidate.id;
}

async function findEntityId(
  transaction: CandidateTransaction,
  type: 'company' | 'product' | 'model' | 'person' | 'topic',
  normalizedName: string,
): Promise<string | null> {
  const [match] = await transaction
    .select({ id: entities.id })
    .from(entities)
    .leftJoin(entityAliases, eq(entityAliases.entityId, entities.id))
    .where(
      and(
        eq(entities.entityType, type),
        eq(entities.status, 'active'),
        or(
          eq(entityAliases.normalizedAlias, normalizedName),
          sql`lower(${entities.canonicalName}) = ${normalizedName}`,
        ),
      ),
    )
    .limit(1);
  return match?.id ?? null;
}
