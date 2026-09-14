import type { PublicContentQuery } from './model';

export type PublicSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceType: string;
  reliability: string;
  relation: string;
  publishedAt: Date | null;
  accessedAt: Date;
};

export type PublicTopic = { id: string; slug: string; name: string };
export type PublicTopicSummary = PublicTopic & {
  description: string;
  contentCount: number;
  updatedAt: Date;
};
export type PublicCorrection = { description: string; correctedAt: Date };

export type PublicContentItem = {
  id: string;
  type: 'news' | 'briefing' | 'analysis';
  slug: string;
  title: string;
  dek: string;
  summary: string;
  body: Record<string, unknown>;
  status: 'published' | 'updated' | 'withdrawn';
  verification: 'confirmed' | 'developing' | 'unverified';
  importance: number;
  actionability: number;
  authorName: string;
  publishedAt: Date;
  updatedAt: Date;
  aiDisclosure: Record<string, unknown> | null;
  seo: Record<string, unknown>;
  sources: PublicSource[];
  topics: PublicTopic[];
  corrections: PublicCorrection[];
  sourceCount: number;
};

export type PublicContentListItem = Omit<
  PublicContentItem,
  'body' | 'sources' | 'corrections'
>;

export type PublicContentLookup =
  | { kind: 'content'; item: PublicContentItem }
  | { kind: 'redirect'; location: string }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export type PublicTopicLookup =
  | { kind: 'topic'; topic: PublicTopicSummary }
  | { kind: 'redirect'; location: string }
  | { kind: 'missing' };

export interface PublicContentRepository {
  list(
    query: PublicContentQuery,
  ): Promise<{ items: PublicContentListItem[]; hasMore: boolean }>;
  findBySlug(slug: string): Promise<PublicContentLookup>;
  findLatestByType(
    type: PublicContentItem['type'],
  ): Promise<PublicContentLookup>;
  findBriefingByDate(date: string): Promise<PublicContentLookup>;
  listTopics(): Promise<PublicTopicSummary[]>;
  findTopicBySlug(slug: string): Promise<PublicTopicLookup>;
}
