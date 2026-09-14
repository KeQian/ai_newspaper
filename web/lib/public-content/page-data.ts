import { cache } from 'react';

import { publicContentQuerySchema } from './model';
import { createPublicContentServiceFromEnvironment } from './runtime';
import type {
  PublicContentListItem,
  PublicContentLookup,
  PublicTopicSummary,
} from './types';

export type HomeData = {
  state: 'ready' | 'empty' | 'unavailable';
  headlines: PublicContentListItem[];
  radar: PublicContentListItem[];
  analyses: PublicContentListItem[];
  topics: Array<{ id: string; slug: string; name: string; count: number }>;
  lastUpdatedAt: Date | null;
};

export const loadHomeData = cache(async (topic?: string): Promise<HomeData> => {
  try {
    const service = createPublicContentServiceFromEnvironment();
    const [headlinesPage, radarPage, analyses] = await Promise.all([
      service.list(publicContentQuerySchema.parse({ type: 'news', limit: 12 })),
      topic
        ? service.list(
            publicContentQuerySchema.parse({ type: 'news', topic, limit: 10 }),
          )
        : service.list(
            publicContentQuerySchema.parse({ type: 'news', limit: 10 }),
          ),
      service.list(
        publicContentQuerySchema.parse({ type: 'analysis', limit: 3 }),
      ),
    ]);
    const ranked = [...headlinesPage.items].sort(
      (a, b) =>
        b.importance - a.importance ||
        b.publishedAt.getTime() - a.publishedAt.getTime(),
    );
    const topicCounts = new Map<
      string,
      { id: string; slug: string; name: string; count: number }
    >();
    for (const item of [...headlinesPage.items, ...analyses.items])
      for (const current of item.topics) {
        const stored = topicCounts.get(current.id);
        topicCounts.set(current.id, {
          ...current,
          count: (stored?.count ?? 0) + 1,
        });
      }
    return {
      state: headlinesPage.items.length ? 'ready' : 'empty',
      headlines: ranked.slice(0, 3),
      radar: radarPage.items,
      analyses: analyses.items,
      topics: [...topicCounts.values()]
        .sort(
          (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'),
        )
        .slice(0, 5),
      lastUpdatedAt:
        headlinesPage.items[0]?.updatedAt ??
        analyses.items[0]?.updatedAt ??
        null,
    };
  } catch {
    return {
      state: 'unavailable',
      headlines: [],
      radar: [],
      analyses: [],
      topics: [],
      lastUpdatedAt: null,
    };
  }
});

export const loadPublicContent = cache(
  async (slug: string): Promise<PublicContentLookup> => {
    try {
      return await createPublicContentServiceFromEnvironment().findBySlug(slug);
    } catch {
      return { kind: 'unavailable' };
    }
  },
);

export type PublicListData = {
  state: 'ready' | 'empty' | 'unavailable' | 'invalid';
  items: PublicContentListItem[];
  nextCursor: string | null;
  topics: PublicTopicSummary[];
};

export async function loadPublicList(input: Record<string, unknown>) {
  try {
    const query = publicContentQuerySchema.parse(input);
    const service = createPublicContentServiceFromEnvironment();
    const [page, topics] = await Promise.all([
      service.list(query),
      service.listTopics(),
    ]);
    return {
      state: page.items.length ? 'ready' : 'empty',
      items: page.items,
      nextCursor: page.nextCursor,
      topics,
    } satisfies PublicListData;
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError')
      return {
        state: 'invalid',
        items: [],
        nextCursor: null,
        topics: [],
      } satisfies PublicListData;
    return {
      state: 'unavailable',
      items: [],
      nextCursor: null,
      topics: [],
    } satisfies PublicListData;
  }
}

export const loadTopics = cache(async () => {
  try {
    return {
      state: 'ready' as const,
      topics: await createPublicContentServiceFromEnvironment().listTopics(),
    };
  } catch {
    return { state: 'unavailable' as const, topics: [] };
  }
});

export const loadTopic = cache(async (slug: string) => {
  try {
    return await createPublicContentServiceFromEnvironment().findTopicBySlug(
      slug,
    );
  } catch {
    return { kind: 'unavailable' as const };
  }
});

export const loadBriefingArchive = cache(async (date?: string) => {
  try {
    const service = createPublicContentServiceFromEnvironment();
    const archive = await service.list({ type: 'briefing', limit: 50 });
    if (!date) {
      const latest = await service.findLatestByType('briefing');
      return { kind: 'latest' as const, latest };
    }
    const current = await service.findBriefingByDate(date);
    const dated = archive.items.map((item) => ({
      item,
      date: shanghaiDate(item.publishedAt),
    }));
    return {
      kind: 'archive' as const,
      current,
      previous: dated.find((entry) => entry.date < date)?.date ?? null,
      next:
        [...dated].reverse().find((entry) => entry.date > date)?.date ?? null,
      nearest:
        dated.find((entry) => entry.date < date)?.item ??
        dated.at(-1)?.item ??
        null,
    };
  } catch {
    return { kind: 'unavailable' as const };
  }
});

export const loadAnalysis = cache(async (slug: string) => {
  const result = await loadPublicContent(slug);
  if (result.kind !== 'content') return { result, related: [] };
  const item = result.item;
  if (item.type !== 'analysis')
    return { result: { kind: 'missing' as const }, related: [] };
  try {
    const page = await createPublicContentServiceFromEnvironment().list({
      type: 'analysis',
      topic: item.topics[0]?.slug,
      limit: 4,
    });
    return {
      result,
      related: page.items
        .filter((candidate) => candidate.id !== item.id)
        .slice(0, 3),
    };
  } catch {
    return { result, related: [] };
  }
});

function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}
