import { createSearchHandler } from '@/lib/search/http';
import { createSearchService, searchRateLimiter } from '@/lib/search/runtime';

export const GET = createSearchHandler(
  createSearchService,
  searchRateLimiter(),
);
