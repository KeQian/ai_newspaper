import {
  SearchRateLimitError,
  SearchValidationError,
  searchQuerySchema,
} from './model';
import type { SearchRateLimiter } from './types';
import type { SearchService } from './service';

const cacheHeaders = {
  'Cache-Control':
    'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

export function createSearchHandler(
  createService: () => SearchService,
  rateLimiter: SearchRateLimiter,
) {
  return async (request: Request) => {
    const requestId =
      request.headers.get('x-request-id') ?? crypto.randomUUID();
    try {
      const url = new URL(request.url);
      const parsed = searchQuerySchema.safeParse(
        Object.fromEntries(
          [...url.searchParams.entries()].filter(([, value]) => value !== ''),
        ),
      );
      if (!parsed.success) {
        if ((url.searchParams.get('q')?.length ?? 0) > 120)
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'search.invalid',
              reason: 'query_too_long',
              request_id: requestId,
            }),
          );
        throw new SearchValidationError();
      }
      const key = await requestKey(request);
      const limit = await rateLimiter.consume(key);
      if (!limit.allowed) throw new SearchRateLimitError(limit.retryAfter);
      const page = await createService().search(parsed.data);
      return Response.json(page, { headers: cacheHeaders });
    } catch (error) {
      if (error instanceof SearchValidationError)
        return Response.json(
          { code: 'BAD_REQUEST', message: error.message, requestId },
          { status: 400 },
        );
      if (error instanceof SearchRateLimitError)
        return Response.json(
          { code: 'RATE_LIMITED', message: error.message, requestId },
          {
            status: 429,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': String(error.retryAfter),
            },
          },
        );
      return Response.json(
        {
          code: 'UNAVAILABLE',
          message: 'Search is temporarily unavailable',
          requestId,
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}

async function requestKey(request: Request) {
  const address =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`search:${address}`),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
