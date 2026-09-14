import {
  PublicContentNotFoundError,
  PublicContentValidationError,
  briefingDateSchema,
  publicContentQuerySchema,
  publicSlugSchema,
} from './model';
import type { PublicContentService } from './service';

const cacheHeaders = {
  'Cache-Control':
    'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
};

export function createPublicContentHandlers(
  createService: () => PublicContentService,
) {
  return {
    async list(request: Request) {
      return handle(request, async () => {
        const params = new URL(request.url).searchParams;
        const parsed = publicContentQuerySchema.safeParse(
          Object.fromEntries(
            [...params.entries()].filter(([, value]) => value !== ''),
          ),
        );
        if (!parsed.success) throw new PublicContentValidationError();
        return Response.json(await createService().list(parsed.data), {
          headers: cacheHeaders,
        });
      });
    },
    async get(request: Request, slug: string) {
      return handle(request, async () => {
        if (!slug || slug.length > 180)
          throw new PublicContentValidationError();
        const result = await createService().findBySlug(slug);
        if (result.kind === 'redirect')
          return Response.redirect(new URL(result.location, request.url), 301);
        if (result.kind === 'missing') throw new PublicContentNotFoundError();
        if (result.kind === 'unavailable')
          throw new Error('Content repository unavailable');
        return Response.json(result.item, { headers: cacheHeaders });
      });
    },
    async briefing(request: Request, date: string) {
      return handle(request, async () => {
        const parsed = briefingDateSchema.safeParse(date);
        if (!parsed.success) throw new PublicContentValidationError();
        if (parsed.data > shanghaiDate(new Date()))
          throw new PublicContentNotFoundError();
        const result = await createService().findBriefingByDate(parsed.data);
        if (result.kind === 'unavailable')
          throw new Error('Content repository unavailable');
        if (result.kind !== 'content') throw new PublicContentNotFoundError();
        return Response.json(result.item, { headers: cacheHeaders });
      });
    },
    async topics(request: Request) {
      return handle(request, async () =>
        Response.json(await createService().listTopics(), {
          headers: cacheHeaders,
        }),
      );
    },
    async topic(request: Request, slug: string) {
      return handle(request, async () => {
        if (!publicSlugSchema.safeParse(slug).success)
          throw new PublicContentValidationError();
        const result = await createService().findTopicBySlug(slug);
        if (result.kind === 'redirect')
          return Response.redirect(new URL(result.location, request.url), 301);
        if (result.kind === 'missing') throw new PublicContentNotFoundError();
        return Response.json(
          { ...result.topic, latestContent: result.content },
          { headers: cacheHeaders },
        );
      });
    },
  };
}

function shanghaiDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

async function handle(request: Request, operation: () => Promise<Response>) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PublicContentValidationError)
      return Response.json(
        { code: 'BAD_REQUEST', message: error.message, requestId },
        { status: 400 },
      );
    if (error instanceof PublicContentNotFoundError)
      return Response.json(
        { code: 'NOT_FOUND', message: error.message, requestId },
        { status: 404 },
      );
    return Response.json(
      {
        code: 'UNAVAILABLE',
        message: 'Content is temporarily unavailable',
        requestId,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
