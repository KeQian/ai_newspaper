import { z } from 'zod';

import { readAdminSessionToken } from '@/lib/auth/cookie';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/model';
import { requirePermission } from '@/lib/auth/permissions';
import type { AdminSessionService } from '@/lib/auth/session-service';

import { redactAuditValue } from './redact';
import type { AuditRecord, AuditRepository } from './types';

const querySchema = z
  .object({
    action: z.string().min(1).max(160).optional(),
    objectType: z.string().min(1).max(120).optional(),
    actorId: z.string().uuid().optional(),
    requestId: z.string().min(1).max(200).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const cursorSchema = z.tuple([z.string().datetime(), z.string().uuid()]);
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
class InvalidAuditQueryError extends Error {}

export function createAuditHandler(input: {
  createSessionService: () => AdminSessionService;
  createRepository: () => AuditRepository;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return async function GET(request: Request): Promise<Response> {
    const requestId =
      request.headers.get('x-request-id') ?? crypto.randomUUID();
    try {
      const session = await input
        .createSessionService()
        .getSession(readAdminSessionToken(request), now());
      requirePermission(session, 'audit.read');
      const url = new URL(request.url);
      const parsed = querySchema.parse(
        Object.fromEntries(
          [...url.searchParams.entries()].filter(([, value]) => value !== ''),
        ),
      );
      if (
        parsed.from &&
        parsed.to &&
        new Date(parsed.from).getTime() > new Date(parsed.to).getTime()
      ) {
        throw new InvalidAuditQueryError();
      }
      const before = parsed.cursor ? decodeCursor(parsed.cursor) : undefined;
      const rows = await input.createRepository().list({
        ...parsed,
        from: parsed.from ? new Date(parsed.from) : undefined,
        to: parsed.to ? new Date(parsed.to) : undefined,
        before,
        limit: parsed.limit + 1,
      });
      const hasMore = rows.length > parsed.limit;
      const items = rows.slice(0, parsed.limit);
      return Response.json(
        {
          items: items.map(serialize),
          hasMore,
          nextCursor: hasMore ? encodeCursor(items.at(-1)!) : null,
        },
        { headers: privateHeaders },
      );
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
      if (
        error instanceof z.ZodError ||
        error instanceof InvalidAuditQueryError
      ) {
        return Response.json(
          { code: 'BAD_REQUEST', message: 'Invalid request', requestId },
          { status: 400, headers: privateHeaders },
        );
      }
      return Response.json(
        {
          code: 'UNAVAILABLE',
          message: 'Audit data is unavailable',
          requestId,
        },
        { status: 503, headers: privateHeaders },
      );
    }
  };
}

function serialize(row: AuditRecord) {
  return {
    ...row,
    before: redactAuditValue(row.before),
    after: redactAuditValue(row.after),
    createdAt: row.createdAt.toISOString(),
  };
}

function encodeCursor(row: AuditRecord) {
  return btoa(JSON.stringify([row.createdAt.toISOString(), row.id]))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decodeCursor(value: string) {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const [createdAt, id] = cursorSchema.parse(
      JSON.parse(
        atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
      ),
    );
    return { createdAt: new Date(createdAt), id };
  } catch {
    throw new InvalidAuditQueryError();
  }
}
