import { z } from 'zod';

import { readAdminSessionToken } from '@/lib/auth/cookie';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/model';
import { requirePermission } from '@/lib/auth/permissions';
import type { AdminSessionService } from '@/lib/auth/session-service';

import type { IngestionRunRepository, StoredIngestionRun } from './repository';
import type { SourceRegistryService } from './source-service';

const runQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
const runIdSchema = z.string().uuid();
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

class InvalidCursorError extends Error {}

export function createAdminIngestionHandlers(input: {
  createSessionService: () => AdminSessionService;
  createSourceService: () => SourceRegistryService;
  createRunRepository: () => IngestionRunRepository;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async listSources(request: Request): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const session = await getSession(
          request,
          input.createSessionService,
          now,
        );
        requirePermission(session, 'source.read');
        const items = await input.createSourceService().listSources(now());
        return Response.json({ items }, { headers: privateHeaders });
      } catch (error) {
        return adminErrorResponse(error, requestId);
      }
    },

    async listRuns(request: Request): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const session = await getSession(
          request,
          input.createSessionService,
          now,
        );
        requirePermission(session, 'run.read');
        const url = new URL(request.url);
        const query = parseRunQuery({
          limit: url.searchParams.get('limit') ?? undefined,
          cursor: url.searchParams.get('cursor') ?? undefined,
        });
        const before = query.cursor ? decodeRunCursor(query.cursor) : undefined;
        const rows = await input.createRunRepository().listRuns({
          limit: query.limit + 1,
          before,
        });
        const hasMore = rows.length > query.limit;
        const runs = rows.slice(0, query.limit);
        return Response.json(
          {
            items: runs.map(serializeRun),
            nextCursor: hasMore ? encodeRunCursor(runs.at(-1)!) : null,
            hasMore,
          },
          { headers: privateHeaders },
        );
      } catch (error) {
        return adminErrorResponse(error, requestId);
      }
    },

    async getRun(request: Request, id: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const session = await getSession(
          request,
          input.createSessionService,
          now,
        );
        requirePermission(session, 'run.read');
        const parsedId = runIdSchema.safeParse(id);
        if (!parsedId.success) throw new InvalidCursorError();
        const result = await input.createRunRepository().getRun(parsedId.data);
        if (!result) {
          return Response.json(
            { code: 'NOT_FOUND', message: 'Run not found', requestId },
            { status: 404, headers: privateHeaders },
          );
        }
        return Response.json(
          {
            ...serializeRun(result.run),
            sourceResults: result.sources.map((source) => ({
              ...source,
            })),
          },
          { headers: privateHeaders },
        );
      } catch (error) {
        return adminErrorResponse(error, requestId);
      }
    },
  };
}

async function getSession(
  request: Request,
  createService: () => AdminSessionService,
  now: () => Date,
) {
  return createService().getSession(readAdminSessionToken(request), now());
}

function serializeRun(run: StoredIngestionRun) {
  return {
    id: run.id,
    jobKey: run.jobKey,
    status: run.status,
    scheduledAt: run.scheduledAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    fetchedCount: run.fetchedCount,
    newCount: run.newCount,
    duplicateCount: run.duplicateCount,
    errorCount: run.errorCount,
    errorSummary: run.errorSummary,
  };
}

function encodeRunCursor(run: StoredIngestionRun): string {
  return btoa(`${run.scheduledAt.toISOString()}|${run.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function decodeRunCursor(cursor: string): { scheduledAt: Date; id: string } {
  let decoded: string;
  try {
    const normalized = cursor.replaceAll('-', '+').replaceAll('_', '/');
    decoded = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
    );
  } catch {
    throw new InvalidCursorError();
  }
  const [scheduledAt, id, ...extra] = decoded.split('|');
  const date = new Date(scheduledAt);
  if (extra.length > 0 || Number.isNaN(date.getTime())) {
    throw new InvalidCursorError();
  }
  const parsedId = runIdSchema.safeParse(id);
  if (!parsedId.success) throw new InvalidCursorError();
  return { scheduledAt: date, id: parsedId.data };
}

function adminErrorResponse(error: unknown, requestId: string): Response {
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
  if (error instanceof InvalidCursorError) {
    return Response.json(
      { code: 'BAD_REQUEST', message: 'Invalid request', requestId },
      { status: 400, headers: privateHeaders },
    );
  }
  return Response.json(
    {
      code: 'UNAVAILABLE',
      message: 'Ingestion data is unavailable',
      requestId,
    },
    { status: 503, headers: privateHeaders },
  );
}

function getRequestId(request: Request): string {
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}

function parseRunQuery(input: unknown): z.infer<typeof runQuerySchema> {
  const result = runQuerySchema.safeParse(input);
  if (!result.success) throw new InvalidCursorError();
  return result.data;
}
