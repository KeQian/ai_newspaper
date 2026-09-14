import { and, desc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  adminUsers,
  contentItems,
  contentSources,
  contentTopics,
  correctionNotes,
  entities,
  slugRedirects,
} from '@/db/schema';

import { PublicContentValidationError, type PublicContentQuery } from './model';
import type {
  PublicContentItem,
  PublicContentListItem,
  PublicContentLookup,
  PublicContentRepository,
  PublicTopicLookup,
} from './types';

const publicStatuses = ['published', 'updated'] as const;

export class DrizzlePublicContentRepository implements PublicContentRepository {
  constructor(private readonly database: Database) {}

  async list(query: PublicContentQuery) {
    const conditions = [inArray(contentItems.status, publicStatuses)];
    if (query.type) conditions.push(eq(contentItems.contentType, query.type));
    if (query.verification)
      conditions.push(eq(contentItems.verification, query.verification));
    if (query.importanceMin)
      conditions.push(gte(contentItems.importance, query.importanceMin));
    if (query.from) conditions.push(gte(contentItems.publishedAt, query.from));
    if (query.to) conditions.push(lte(contentItems.publishedAt, query.to));
    if (query.source)
      conditions.push(sql`exists (
        select 1 from ${contentSources} cs
        where cs.content_id = ${contentItems.id}
          and cs.publisher ilike ${query.source}
      )`);
    if (query.topic)
      conditions.push(sql`exists (
      select 1 from ${contentTopics} ct inner join ${entities} e on e.id = ct.entity_id
      where ct.content_id = ${contentItems.id} and e.slug = ${query.topic}
    )`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(
        or(
          lt(contentItems.publishedAt, cursor.publishedAt),
          and(
            eq(contentItems.publishedAt, cursor.publishedAt),
            lt(contentItems.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.database
      .select({
        id: contentItems.id,
        type: contentItems.contentType,
        slug: contentItems.slug,
        title: contentItems.title,
        dek: contentItems.dek,
        summary: contentItems.summary,
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
      })
      .from(contentItems)
      .innerJoin(adminUsers, eq(contentItems.authorId, adminUsers.id))
      .where(and(...conditions))
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.id))
      .limit(query.limit + 1);
    const visible = rows.slice(0, query.limit);
    const topicMap = await topicsFor(
      this.database,
      visible.map(({ id }) => id),
    );
    return {
      items: visible.map((row) => ({
        ...row,
        status: row.status as PublicContentListItem['status'],
        publishedAt: requirePublishedAt(row.publishedAt),
        topics: topicMap.get(row.id) ?? [],
      })),
      hasMore: rows.length > query.limit,
    };
  }

  async findBySlug(slug: string): Promise<PublicContentLookup> {
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
        publishedAt: contentItems.publishedAt,
        updatedAt: contentItems.updatedAt,
        aiDisclosure: contentItems.aiDisclosure,
        seo: contentItems.seo,
        withdrawalReason: contentItems.withdrawalReason,
      })
      .from(contentItems)
      .innerJoin(adminUsers, eq(contentItems.authorId, adminUsers.id))
      .where(
        and(
          eq(contentItems.slug, slug),
          inArray(contentItems.status, ['published', 'updated', 'withdrawn']),
        ),
      )
      .limit(1);
    if (!row) {
      const [redirect] = await this.database
        .select({ location: slugRedirects.newPath })
        .from(slugRedirects)
        .where(
          inArray(slugRedirects.oldPath, [
            `/news/${slug}`,
            `/analysis/${slug}`,
            `/briefing/${slug}`,
          ]),
        )
        .limit(1);
      return redirect
        ? { kind: 'redirect', location: redirect.location }
        : { kind: 'missing' };
    }
    const [sources, topicMap, corrections] = await Promise.all([
      this.database
        .select({
          id: contentSources.id,
          title: contentSources.title,
          publisher: contentSources.publisher,
          url: contentSources.url,
          sourceType: contentSources.sourceType,
          reliability: contentSources.reliability,
          relation: contentSources.relation,
          publishedAt: contentSources.publishedAt,
          accessedAt: contentSources.accessedAt,
        })
        .from(contentSources)
        .where(eq(contentSources.contentId, row.id))
        .orderBy(contentSources.createdAt),
      topicsFor(this.database, [row.id]),
      this.database
        .select({
          description: correctionNotes.description,
          correctedAt: correctionNotes.correctedAt,
        })
        .from(correctionNotes)
        .where(eq(correctionNotes.contentId, row.id))
        .orderBy(desc(correctionNotes.correctedAt)),
    ]);
    const withdrawn = row.status === 'withdrawn';
    return {
      kind: 'content',
      item: {
        ...row,
        status: row.status as PublicContentItem['status'],
        publishedAt: requirePublishedAt(row.publishedAt),
        body: withdrawn
          ? { schemaVersion: 1, type: 'doc', content: [] }
          : row.body,
        dek: withdrawn ? '' : row.dek,
        summary: withdrawn
          ? (row.withdrawalReason ?? '该内容已撤回。')
          : row.summary,
        sources: withdrawn ? [] : sources,
        sourceCount: withdrawn ? 0 : sources.length,
        topics: topicMap.get(row.id) ?? [],
        corrections,
      },
    };
  }

  async findLatestByType(type: PublicContentItem['type']) {
    const [row] = await this.database
      .select({ slug: contentItems.slug })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.contentType, type),
          inArray(contentItems.status, publicStatuses),
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.id))
      .limit(1);
    return row ? this.findBySlug(row.slug) : { kind: 'missing' as const };
  }

  async findBriefingByDate(date: string) {
    const [row] = await this.database
      .select({ slug: contentItems.slug })
      .from(contentItems)
      .where(
        and(
          eq(contentItems.contentType, 'briefing'),
          inArray(contentItems.status, publicStatuses),
          sql`(${contentItems.publishedAt} at time zone 'Asia/Shanghai')::date = ${date}::date`,
        ),
      )
      .orderBy(desc(contentItems.publishedAt), desc(contentItems.id))
      .limit(1);
    return row ? this.findBySlug(row.slug) : { kind: 'missing' as const };
  }

  async listTopics() {
    const rows = await this.database
      .select({
        id: entities.id,
        slug: entities.slug,
        nameZh: entities.nameZh,
        nameEn: entities.nameEn,
        canonicalName: entities.canonicalName,
        description: entities.description,
        updatedAt: entities.updatedAt,
      })
      .from(entities)
      .where(
        and(eq(entities.entityType, 'topic'), eq(entities.status, 'active')),
      )
      .orderBy(entities.canonicalName);
    const counts = await this.database
      .select({
        entityId: contentTopics.entityId,
        contentCount: sql<number>`count(distinct ${contentTopics.contentId})::int`,
      })
      .from(contentTopics)
      .innerJoin(contentItems, eq(contentItems.id, contentTopics.contentId))
      .where(inArray(contentItems.status, publicStatuses))
      .groupBy(contentTopics.entityId);
    const countById = new Map(
      counts.map((row) => [row.entityId, row.contentCount]),
    );
    return rows
      .map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.nameZh ?? row.nameEn ?? row.canonicalName,
        description: row.description ?? '',
        contentCount: countById.get(row.id) ?? 0,
        updatedAt: row.updatedAt,
      }))
      .sort(
        (a, b) =>
          b.contentCount - a.contentCount ||
          a.name.localeCompare(b.name, 'zh-CN'),
      );
  }

  async findTopicBySlug(slug: string): Promise<PublicTopicLookup> {
    const [row] = await this.database
      .select({
        id: entities.id,
        slug: entities.slug,
        nameZh: entities.nameZh,
        nameEn: entities.nameEn,
        canonicalName: entities.canonicalName,
        description: entities.description,
        status: entities.status,
        mergedIntoId: entities.mergedIntoId,
        updatedAt: entities.updatedAt,
      })
      .from(entities)
      .where(and(eq(entities.entityType, 'topic'), eq(entities.slug, slug)))
      .limit(1);
    if (!row) {
      const [redirect] = await this.database
        .select({ location: slugRedirects.newPath })
        .from(slugRedirects)
        .where(eq(slugRedirects.oldPath, `/topics/${slug}`))
        .limit(1);
      return redirect
        ? { kind: 'redirect', location: redirect.location }
        : { kind: 'missing' };
    }
    if (row.status === 'deprecated' && row.mergedIntoId) {
      const [target] = await this.database
        .select({ slug: entities.slug })
        .from(entities)
        .where(eq(entities.id, row.mergedIntoId))
        .limit(1);
      return target
        ? { kind: 'redirect', location: `/topics/${target.slug}` }
        : { kind: 'missing' };
    }
    if (row.status !== 'active') return { kind: 'missing' };
    const [count] = await this.database
      .select({
        value: sql<number>`count(distinct ${contentTopics.contentId})::int`,
      })
      .from(contentTopics)
      .innerJoin(contentItems, eq(contentItems.id, contentTopics.contentId))
      .where(
        and(
          eq(contentTopics.entityId, row.id),
          inArray(contentItems.status, publicStatuses),
        ),
      );
    return {
      kind: 'topic',
      topic: {
        id: row.id,
        slug: row.slug,
        name: row.nameZh ?? row.nameEn ?? row.canonicalName,
        description: row.description ?? '',
        contentCount: count?.value ?? 0,
        updatedAt: row.updatedAt,
      },
    };
  }
}

export function nextPublicCursor(
  items: PublicContentListItem[],
  hasMore: boolean,
) {
  const last = items.at(-1);
  return hasMore && last ? encodeCursor(last.publishedAt, last.id) : null;
}

function encodeCursor(publishedAt: Date, id: string) {
  return btoa(`${publishedAt.toISOString()}|${id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decodeCursor(cursor: string) {
  try {
    const normalized = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const [date, id, ...extra] = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
    ).split('|');
    const publishedAt = new Date(date);
    if (
      extra.length ||
      Number.isNaN(publishedAt.getTime()) ||
      !/^[0-9a-f-]{36}$/i.test(id)
    )
      throw new Error();
    return { publishedAt, id };
  } catch {
    throw new PublicContentValidationError('Invalid cursor');
  }
}

function requirePublishedAt(value: Date | null) {
  if (!value) throw new Error('Published content is missing published_at');
  return value;
}

async function topicsFor(database: Database, ids: string[]) {
  const map = new Map<
    string,
    Array<{ id: string; slug: string; name: string }>
  >();
  if (!ids.length) return map;
  const rows = await database
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
    .where(inArray(contentTopics.contentId, ids));
  for (const row of rows) {
    const topics = map.get(row.contentId) ?? [];
    topics.push({
      id: row.id,
      slug: row.slug,
      name: row.nameZh ?? row.nameEn ?? row.canonicalName,
    });
    map.set(row.contentId, topics);
  }
  return map;
}
