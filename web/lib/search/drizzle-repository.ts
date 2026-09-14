import { and, desc, eq, ilike, inArray, lt, or, sql } from 'drizzle-orm';

import {
  adminUsers,
  contentItems,
  contentSources,
  contentTopics,
  entities,
  entityAliases,
  searchDocuments,
} from '@/db/schema';
import type {
  PublicContentListItem,
  PublicTopic,
  PublicTopicSummary,
} from '@/lib/public-content/types';

import { SearchValidationError, type SearchQuery } from './model';
import { decodeCursor } from './service';
import type { SearchMatchField, SearchRepository } from './types';

const publicStatuses = ['published', 'updated'] as const;

// Search combines calculated ranks, window-like counts and correlated topic
// projections. Erasing the fluent client generic here prevents TypeScript from
// recursively expanding the complete schema while the row DTO remains explicit.
// oxlint-disable-next-line typescript/no-explicit-any
type SearchDatabase = any;
type SearchDatabaseRow = Omit<
  PublicContentListItem,
  'topics' | 'publishedAt' | 'status'
> & {
  status: string;
  publishedAt: Date | null;
  bodyText: string;
  entityText: string;
  score: number | string;
};
type SearchRepositoryPage = Awaited<ReturnType<SearchRepository['search']>>;

export class DrizzleSearchRepository implements SearchRepository {
  constructor(private readonly database: SearchDatabase) {}

  async search(query: SearchQuery): Promise<SearchRepositoryPage> {
    const pattern = `%${escapeLike(query.q)}%`;
    const prefixPattern = `${escapeLike(query.q)}%`;
    const textMatch = sql<boolean>`(
      ${searchDocuments.searchText} ilike ${pattern} escape '\\'
      or to_tsvector('simple', ${searchDocuments.searchText}) @@ websearch_to_tsquery('simple', ${query.q})
    )`;
    const score = sql<number>`(
      case when lower(${searchDocuments.title}) = lower(${query.q}) then 100
           when ${searchDocuments.title} ilike ${prefixPattern} escape '\\' then 60
           when ${searchDocuments.title} ilike ${pattern} escape '\\' then 40 else 0 end
      + case when ${searchDocuments.entityText} ilike ${pattern} escape '\\' then 25 else 0 end
      + case when ${searchDocuments.summary} ilike ${pattern} escape '\\' then 15 else 0 end
      + ts_rank_cd(to_tsvector('simple', ${searchDocuments.searchText}), websearch_to_tsquery('simple', ${query.q})) * 10
    )::double precision`;
    const base = [inArray(contentItems.status, publicStatuses), textMatch];
    if (query.type) base.push(eq(searchDocuments.contentType, query.type));
    if (query.topic)
      base.push(sql<boolean>`exists (
        select 1 from ${contentTopics} ct
        inner join ${entities} e on e.id = ct.entity_id
        where ct.content_id = ${contentItems.id} and e.slug = ${query.topic}
      )`);

    const conditions = [...base];
    if (query.cursor) {
      let cursor;
      try {
        cursor = decodeCursor(query.cursor);
      } catch {
        throw new SearchValidationError('Invalid search cursor');
      }
      conditions.push(
        query.sort === 'latest'
          ? or(
              lt(searchDocuments.publishedAt, cursor.publishedAt),
              and(
                eq(searchDocuments.publishedAt, cursor.publishedAt),
                lt(searchDocuments.contentId, cursor.id),
              ),
            )!
          : sql<boolean>`(
              ${score} < ${cursor.score}
              or (${score} = ${cursor.score} and ${searchDocuments.publishedAt} < ${cursor.publishedAt})
              or (${score} = ${cursor.score} and ${searchDocuments.publishedAt} = ${cursor.publishedAt} and ${searchDocuments.contentId} < ${cursor.id})
            )`,
      );
    }

    const rows: SearchDatabaseRow[] = await this.database
      .select({
        id: contentItems.id,
        type: contentItems.contentType,
        slug: contentItems.slug,
        title: contentItems.title,
        dek: contentItems.dek,
        summary: contentItems.summary,
        bodyText: searchDocuments.bodyText,
        entityText: searchDocuments.entityText,
        status: contentItems.status,
        verification: contentItems.verification,
        importance: contentItems.importance,
        actionability: contentItems.actionability,
        authorName: adminUsers.displayName,
        publishedAt: contentItems.publishedAt,
        updatedAt: contentItems.updatedAt,
        aiDisclosure: contentItems.aiDisclosure,
        seo: contentItems.seo,
        sourceCount: sql<number>`(select count(*)::int from ${contentSources} cs where cs.content_id = ${contentItems.id})`,
        score,
      })
      .from(searchDocuments)
      .innerJoin(contentItems, eq(searchDocuments.contentId, contentItems.id))
      .innerJoin(adminUsers, eq(contentItems.authorId, adminUsers.id))
      .where(and(...conditions))
      .orderBy(
        ...(query.sort === 'latest' ? [] : [desc(score)]),
        desc(searchDocuments.publishedAt),
        desc(searchDocuments.contentId),
      )
      .limit(query.limit + 1);
    const visible = rows.slice(0, query.limit);
    const [topicMap, totalApprox, topics] = await Promise.all([
      topicsFor(
        this.database,
        visible.map(({ id }) => id),
      ),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(searchDocuments)
        .innerJoin(contentItems, eq(searchDocuments.contentId, contentItems.id))
        .where(and(...base))
        .then(([row]: Array<{ count: number | string }>) =>
          Number(row?.count ?? 0),
        ),
      relatedTopics(this.database, query.q),
    ]);
    return {
      items: visible.map(({ bodyText, entityText, score: rank, ...row }) => ({
        ...row,
        status: row.status as PublicContentListItem['status'],
        publishedAt: requirePublishedAt(row.publishedAt),
        topics: topicMap.get(row.id) ?? [],
        score: Number(rank),
        ...snippetFor(query.q, row.title, row.summary, bodyText, entityText),
      })),
      topics,
      totalApprox,
      hasMore: rows.length > query.limit,
    };
  }
}

function snippetFor(
  query: string,
  title: string,
  summary: string,
  body: string,
  entity: string,
): { snippet: string; matchField: SearchMatchField } {
  const candidates: Array<[SearchMatchField, string]> = [
    ['title', title],
    ['summary', summary],
    ['entity', entity],
    ['body', body],
  ];
  const folded = query.toLocaleLowerCase();
  const [matchField, value] =
    candidates.find(([, text]) => text.toLocaleLowerCase().includes(folded)) ??
    candidates[1];
  const index = value.toLocaleLowerCase().indexOf(folded);
  const start = Math.max(0, index - 55);
  const excerpt = value
    .slice(start, start + 180)
    .replace(/\s+/g, ' ')
    .trim();
  return {
    matchField,
    snippet: `${start > 0 ? '…' : ''}${excerpt}${start + 180 < value.length ? '…' : ''}`,
  };
}

async function topicsFor(database: SearchDatabase, contentIds: string[]) {
  const result = new Map<string, PublicTopic[]>();
  if (!contentIds.length) return result;
  const rows: Array<{
    contentId: string;
    id: string;
    slug: string;
    nameZh: string | null;
    nameEn: string | null;
    canonicalName: string;
  }> = await database
    .select({
      contentId: contentTopics.contentId,
      id: entities.id,
      slug: entities.slug,
      nameZh: entities.nameZh,
      nameEn: entities.nameEn,
      canonicalName: entities.canonicalName,
    })
    .from(contentTopics)
    .innerJoin(entities, eq(contentTopics.entityId, entities.id))
    .where(inArray(contentTopics.contentId, contentIds));
  for (const row of rows) {
    const topics = result.get(row.contentId) ?? [];
    topics.push({
      id: row.id,
      slug: row.slug,
      name: row.nameZh ?? row.nameEn ?? row.canonicalName,
    });
    result.set(row.contentId, topics);
  }
  return result;
}

async function relatedTopics(
  database: SearchDatabase,
  query: string,
): Promise<PublicTopicSummary[]> {
  const pattern = `%${escapeLike(query)}%`;
  const rows: Array<{
    id: string;
    slug: string;
    nameZh: string | null;
    nameEn: string | null;
    canonicalName: string;
    description: string | null;
    updatedAt: Date;
    contentCount: number | string;
  }> = await database
    .select({
      id: entities.id,
      slug: entities.slug,
      nameZh: entities.nameZh,
      nameEn: entities.nameEn,
      canonicalName: entities.canonicalName,
      description: entities.description,
      updatedAt: entities.updatedAt,
      contentCount: sql<number>`(
        select count(*)::int from ${contentTopics} ct
        inner join ${contentItems} ci on ci.id = ct.content_id
        where ct.entity_id = ${entities.id} and ci.status in ('published', 'updated')
      )`,
    })
    .from(entities)
    .where(
      and(
        eq(entities.status, 'active'),
        or(
          ilike(entities.canonicalName, pattern),
          ilike(entities.nameZh, pattern),
          ilike(entities.nameEn, pattern),
          sql<boolean>`exists (
            select 1 from ${entityAliases} ea
            where ea.entity_id = ${entities.id} and ea.alias ilike ${pattern} escape '\\'
          )`,
        ),
      ),
    )
    .orderBy(desc(entities.updatedAt))
    .limit(5);
  return rows.map(
    ({ nameZh, nameEn, canonicalName, contentCount, description, ...row }) => ({
      ...row,
      name: nameZh ?? nameEn ?? canonicalName,
      description: description ?? '',
      contentCount: Number(contentCount),
    }),
  );
}

function escapeLike(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function requirePublishedAt(value: Date | null) {
  if (!value)
    throw new Error('Search projection points to unpublished content');
  return value;
}
