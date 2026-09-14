import type {
  PublicContentListItem,
  PublicTopicSummary,
} from '@/lib/public-content/types';

import type { SearchQuery } from './model';

export type SearchMatchField = 'title' | 'summary' | 'body' | 'entity';

export type SearchResult = PublicContentListItem & {
  snippet: string;
  matchField: SearchMatchField;
  score: number;
};

export type SearchPage = {
  query: string;
  items: SearchResult[];
  topics: PublicTopicSummary[];
  totalApprox: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export interface SearchRepository {
  search(query: SearchQuery): Promise<{
    items: SearchResult[];
    topics: PublicTopicSummary[];
    totalApprox: number;
    hasMore: boolean;
  }>;
}

export interface SearchRateLimiter {
  consume(
    key: string,
    now?: Date,
  ): Promise<{ allowed: boolean; retryAfter: number }>;
}
