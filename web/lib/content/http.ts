import { z } from 'zod';

import { readAdminSessionToken } from '@/lib/auth/cookie';
import { requireSameOrigin } from '@/lib/auth/csrf';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/model';
import { requirePermission, requireRecentMfa } from '@/lib/auth/permissions';
import type { AdminSessionService } from '@/lib/auth/session-service';

import {
  ContentConflictError,
  ContentNotFoundError,
  ContentValidationError,
  contentDraftInputSchema,
  contentListQuerySchema,
  contentUpdateInputSchema,
  correctionInputSchema,
  publishInputSchema,
  versionInputSchema,
  withdrawInputSchema,
} from './model';
import type { ContentService } from './service';

const idSchema = z.string().uuid();
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

export function createContentHandlers(input: {
  createSessionService: () => AdminSessionService;
  createContentService: () => ContentService;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  async function session(
    request: Request,
    permission:
      | 'content.read'
      | 'content.edit'
      | 'content.publish'
      | 'content.withdraw',
  ) {
    const current = await input
      .createSessionService()
      .getSession(readAdminSessionToken(request), now());
    requirePermission(current, permission);
    if (permission === 'content.publish' || permission === 'content.withdraw')
      requireRecentMfa(current, now(), 15);
    return current;
  }

  return {
    async list(request: Request) {
      return handle(request, async () => {
        await session(request, 'content.read');
        const params = new URL(request.url).searchParams;
        const query = parseRequest(
          contentListQuerySchema,
          Object.fromEntries(
            [...params.entries()].filter(([, value]) => value !== ''),
          ),
        );
        return Response.json(await input.createContentService().list(query), {
          headers: privateHeaders,
        });
      });
    },

    async create(request: Request) {
      return handle(request, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'content.edit');
        const draft = parseRequest(
          contentDraftInputSchema,
          await request.json(),
        );
        const result = await input
          .createContentService()
          .create(draft, current.adminId, requestId, now());
        return Response.json(
          { ...result, requestId },
          { status: 201, headers: privateHeaders },
        );
      });
    },

    async get(request: Request, id: string) {
      return handle(request, async () => {
        await session(request, 'content.read');
        const parsedId = parseRequest(idSchema, id);
        const item = await input.createContentService().get(parsedId);
        if (!item) throw new ContentNotFoundError();
        return Response.json(item, { headers: privateHeaders });
      });
    },

    async update(request: Request, id: string) {
      return handle(request, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'content.edit');
        const parsedId = parseRequest(idSchema, id);
        const draft = parseRequest(
          contentUpdateInputSchema,
          await request.json(),
        );
        const result = await input
          .createContentService()
          .update(parsedId, draft, current.adminId, requestId, now());
        return Response.json(
          { ...result, requestId },
          { headers: privateHeaders },
        );
      });
    },

    async transition(
      request: Request,
      id: string,
      action: 'submit_review' | 'publish' | 'cancel_schedule' | 'withdraw',
    ) {
      return handle(request, async (requestId) => {
        requireSameOrigin(request);
        const permission =
          action === 'submit_review'
            ? 'content.edit'
            : action === 'withdraw'
              ? 'content.withdraw'
              : 'content.publish';
        const current = await session(request, permission);
        const parsedId = parseRequest(idSchema, id);
        const body: unknown = await request.json();
        const transition = (() => {
          if (action === 'publish') {
            const payload = parseRequest(publishInputSchema, body);
            return {
              type: 'publish' as const,
              version: payload.version,
              scheduledAt: payload.scheduledAt,
            };
          }
          if (action === 'withdraw') {
            const payload = parseRequest(withdrawInputSchema, body);
            return {
              type: 'withdraw' as const,
              version: payload.version,
              reason: payload.reason,
            };
          }
          const payload = parseRequest(versionInputSchema, body);
          return { type: action, version: payload.version };
        })();
        const result = await input
          .createContentService()
          .transition(parsedId, transition, current.adminId, requestId, now());
        return Response.json(
          { ...result, requestId },
          { headers: privateHeaders },
        );
      });
    },

    async correct(request: Request, id: string) {
      return handle(request, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'content.publish');
        const parsedId = parseRequest(idSchema, id);
        const correction = parseRequest(
          correctionInputSchema,
          await request.json(),
        );
        const result = await input
          .createContentService()
          .correct(parsedId, correction, current.adminId, requestId, now());
        return Response.json(
          { ...result, requestId },
          { headers: privateHeaders },
        );
      });
    },
  };
}

async function handle(
  request: Request,
  operation: (requestId: string) => Promise<Response>,
) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      return Response.json(
        {
          code: error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message:
            error.status === 401
              ? 'Authentication required'
              : 'Permission denied',
          requestId,
        },
        { status: error.status, headers: privateHeaders },
      );
    }
    if (error instanceof ContentNotFoundError)
      return Response.json(
        { code: 'NOT_FOUND', message: error.message, requestId },
        { status: 404, headers: privateHeaders },
      );
    if (error instanceof ContentConflictError)
      return Response.json(
        { code: 'CONFLICT', message: error.message, requestId },
        { status: 409, headers: privateHeaders },
      );
    if (error instanceof ContentValidationError)
      return Response.json(
        {
          code: 'VALIDATION_ERROR',
          message: error.message,
          issues: error.issues,
          requestId,
        },
        { status: 422, headers: privateHeaders },
      );
    return Response.json(
      {
        code: 'UNAVAILABLE',
        message: 'Content service is unavailable',
        requestId,
      },
      { status: 503, headers: privateHeaders },
    );
  }
}

function parseRequest<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ContentValidationError(
      'Invalid request',
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    );
  return parsed.data;
}
