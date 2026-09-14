import { z } from 'zod';

import { readAdminSessionToken } from '@/lib/auth/cookie';
import { requireSameOrigin } from '@/lib/auth/csrf';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/model';
import { requirePermission } from '@/lib/auth/permissions';
import type { AdminSessionService } from '@/lib/auth/session-service';

import {
  CandidateConflictError,
  CandidateDecisionError,
  CandidateNotFoundError,
  candidateDecisionSchema,
  candidateListQuerySchema,
} from './model';
import type { EditorialCandidateService } from './service';

const idSchema = z.string().uuid();
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

export function createEditorialCandidateHandlers(input: {
  createSessionService: () => AdminSessionService;
  createCandidateService: () => EditorialCandidateService;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async list(request: Request) {
      const requestId = requestIdOf(request);
      try {
        const session = await sessionFor(request, input, now());
        requirePermission(session, 'candidate.read');
        const url = new URL(request.url);
        const query = parseRequest(
          candidateListQuerySchema,
          Object.fromEntries(
            Array.from(url.searchParams.entries()).filter(
              ([, value]) => value !== '',
            ),
          ),
        );
        const page = await input.createCandidateService().list(query, now());
        return Response.json(serializePage(page), { headers: privateHeaders });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async get(request: Request, id: string) {
      const requestId = requestIdOf(request);
      try {
        const session = await sessionFor(request, input, now());
        requirePermission(session, 'candidate.read');
        const parsedId = parseRequest(idSchema, id);
        const item = await input.createCandidateService().get(parsedId);
        if (!item) throw new CandidateNotFoundError();
        return Response.json(serializeCandidate(item), {
          headers: privateHeaders,
        });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async decide(request: Request, id: string) {
      const requestId = requestIdOf(request);
      try {
        requireSameOrigin(request);
        const session = await sessionFor(request, input, now());
        requirePermission(session, 'candidate.decide');
        const parsedId = parseRequest(idSchema, id);
        const decision = parseRequest(
          candidateDecisionSchema,
          await request.json(),
        );
        const result = await input.createCandidateService().decide({
          id: parsedId,
          decision,
          actorId: session.adminId,
          requestId,
          now: now(),
        });
        return Response.json(
          { ...result, requestId },
          { headers: privateHeaders },
        );
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },
  };
}

async function sessionFor(
  request: Request,
  input: { createSessionService: () => AdminSessionService },
  now: Date,
) {
  return input
    .createSessionService()
    .getSession(readAdminSessionToken(request), now);
}

function serializePage(
  page: Awaited<ReturnType<EditorialCandidateService['list']>>,
) {
  return {
    ...page,
    items: page.items.map(serializeCandidate),
  };
}

function serializeCandidate<T extends Record<string, unknown>>(item: T) {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}

function requestIdOf(request: Request) {
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}

function errorResponse(error: unknown, requestId: string) {
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
  if (error instanceof CandidateNotFoundError) {
    return Response.json(
      { code: 'NOT_FOUND', message: error.message, requestId },
      { status: 404, headers: privateHeaders },
    );
  }
  if (error instanceof CandidateConflictError) {
    return Response.json(
      { code: 'CONFLICT', message: error.message, requestId },
      { status: 409, headers: privateHeaders },
    );
  }
  if (error instanceof CandidateDecisionError) {
    return Response.json(
      { code: 'VALIDATION_ERROR', message: 'Invalid request', requestId },
      { status: 422, headers: privateHeaders },
    );
  }
  return Response.json(
    {
      code: 'UNAVAILABLE',
      message: 'Candidate data is unavailable',
      requestId,
    },
    { status: 503, headers: privateHeaders },
  );
}

function parseRequest<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new CandidateDecisionError('Invalid request');
  return result.data;
}
