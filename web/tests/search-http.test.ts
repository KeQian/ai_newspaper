// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createSearchHandler } from '@/lib/search/http';
import { MemorySearchRateLimiter } from '@/lib/search/rate-limit';
import { SearchService } from '@/lib/search/service';
import type { SearchRepository } from '@/lib/search/types';

describe('search HTTP contract', () => {
  it('normalizes a valid query and applies public caching', async () => {
    const response = await handler()(
      new Request('https://example.com/api/v1/search?q=%EF%BC%AFpenAI'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    await expect(response.json()).resolves.toMatchObject({
      query: 'OpenAI',
      items: [],
      nextCursor: null,
    });
  });

  it('rejects unknown and oversized input without echoing it', async () => {
    const query = 'x'.repeat(121);
    const response = await handler()(
      new Request(`https://example.com/api/v1/search?q=${query}&unknown=1`),
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(query);
  });

  it('rate limits a client with retry guidance', async () => {
    const limited = handler(new MemorySearchRateLimiter(1, 60_000));
    const request = () =>
      new Request('https://example.com/api/v1/search?q=model', {
        headers: { 'cf-connecting-ip': '203.0.113.1' },
      });
    expect((await limited(request())).status).toBe(200);
    const response = await limited(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
  });
});

function handler(limiter = new MemorySearchRateLimiter()) {
  return createSearchHandler(
    () =>
      new SearchService({
        async search() {
          return {
            items: [],
            topics: [],
            totalApprox: 0,
            hasMore: false,
          };
        },
      } satisfies SearchRepository),
    limiter,
  );
}
