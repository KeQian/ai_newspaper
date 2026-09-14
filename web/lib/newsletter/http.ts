import { z } from 'zod';

import { readAdminSessionToken } from '@/lib/auth/cookie';
import { requireSameOrigin } from '@/lib/auth/csrf';
import { AuthenticationError, AuthorizationError } from '@/lib/auth/model';
import { requirePermission, requireRecentMfa } from '@/lib/auth/permissions';
import type { AdminSessionService } from '@/lib/auth/session-service';
import type { SearchRateLimiter } from '@/lib/search/types';

import {
  idempotencyKeySchema,
  issueInputSchema,
  issueUpdateInputSchema,
  NewsletterBusinessValidationError,
  NewsletterConflictError,
  NewsletterNotFoundError,
  NewsletterTokenError,
  NewsletterValidationError,
  subscriptionInputSchema,
  tokenInputSchema,
} from './model';
import type { NewsletterService } from './service';
import { hashNewsletterValue } from './token';

const idSchema = z.string().uuid();
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const publicHeaders = { 'Cache-Control': 'no-store' };

export function createPublicNewsletterHandlers(input: {
  createService: () => NewsletterService;
  rateLimiter: SearchRateLimiter;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async subscribe(request: Request) {
      return handle(request, publicHeaders, async (requestId) => {
        requireSameOrigin(request);
        const idempotencyKey = parse(
          idempotencyKeySchema,
          request.headers.get('idempotency-key'),
        );
        const body = parse(subscriptionInputSchema, await request.json());
        if (body.website) return genericAccepted();
        const limit = await input.rateLimiter.consume(
          await requestKey(request),
          now(),
        );
        if (!limit.allowed)
          return Response.json(
            {
              code: 'RATE_LIMITED',
              message: 'Please try again later',
              requestId,
            },
            {
              status: 429,
              headers: {
                ...publicHeaders,
                'Retry-After': String(limit.retryAfter),
              },
            },
          );
        await input
          .createService()
          .subscribe(body, idempotencyKey, requestId, now());
        return genericAccepted();
      });
    },
    async confirm(request: Request) {
      return handle(request, publicHeaders, async (requestId) => {
        requireSameOrigin(request);
        const { token } = parse(tokenInputSchema, await request.json());
        await input.createService().confirm(token, now(), requestId);
        return Response.json(
          { status: 'confirmed' },
          { headers: publicHeaders },
        );
      });
    },
    async unsubscribe(request: Request) {
      return handle(request, publicHeaders, async (requestId) => {
        requireSameOrigin(request);
        const { token } = parse(tokenInputSchema, await request.json());
        await input.createService().unsubscribe(token, now(), requestId);
        return Response.json(
          { status: 'unsubscribed' },
          { headers: publicHeaders },
        );
      });
    },
  };
}

export function createAdminNewsletterHandlers(input: {
  createService: () => NewsletterService;
  createSessionService: () => AdminSessionService;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  async function session(
    request: Request,
    permission:
      | 'newsletter.read'
      | 'newsletter.edit'
      | 'newsletter.send_test'
      | 'newsletter.send',
  ) {
    const current = await input
      .createSessionService()
      .getSession(readAdminSessionToken(request), now());
    requirePermission(current, permission);
    if (permission === 'newsletter.send') requireRecentMfa(current, now(), 15);
    return current;
  }
  return {
    async list(request: Request) {
      return handle(request, privateHeaders, async () => {
        await session(request, 'newsletter.read');
        return Response.json(
          { items: await input.createService().listIssues() },
          { headers: privateHeaders },
        );
      });
    },
    async create(request: Request) {
      return handle(request, privateHeaders, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'newsletter.edit');
        const issue = await input
          .createService()
          .createIssue(
            parse(issueInputSchema, await request.json()),
            current.adminId,
            requestId,
            now(),
          );
        return Response.json(issue, { status: 201, headers: privateHeaders });
      });
    },
    async get(request: Request, id: string) {
      return handle(request, privateHeaders, async () => {
        await session(request, 'newsletter.read');
        const issue = await input.createService().getIssue(parse(idSchema, id));
        if (!issue) throw new NewsletterNotFoundError();
        return Response.json(issue, { headers: privateHeaders });
      });
    },
    async update(request: Request, id: string) {
      return handle(request, privateHeaders, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'newsletter.edit');
        const issue = await input
          .createService()
          .updateIssue(
            parse(idSchema, id),
            parse(issueUpdateInputSchema, await request.json()),
            current.adminId,
            requestId,
            now(),
          );
        return Response.json(issue, { headers: privateHeaders });
      });
    },
    async sendTest(request: Request, id: string) {
      return handle(request, privateHeaders, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'newsletter.send_test');
        await input
          .createService()
          .queueTest(
            parse(idSchema, id),
            current.email,
            current.adminId,
            requestId,
            now(),
          );
        return Response.json(
          { status: 'queued' },
          { status: 202, headers: privateHeaders },
        );
      });
    },
    async send(request: Request, id: string) {
      return handle(request, privateHeaders, async (requestId) => {
        requireSameOrigin(request);
        const current = await session(request, 'newsletter.send');
        const idempotencyKey = parse(
          idempotencyKeySchema,
          request.headers.get('idempotency-key'),
        );
        const result = await input
          .createService()
          .queueSend(
            parse(idSchema, id),
            idempotencyKey,
            current.adminId,
            requestId,
            now(),
          );
        return Response.json(
          { status: 'queued', ...result },
          { status: 202, headers: privateHeaders },
        );
      });
    },
  };
}

async function handle(
  request: Request,
  headers: Record<string, string>,
  operation: (requestId: string) => Promise<Response>,
) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    )
      return Response.json(
        {
          code: error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message:
            error.status === 401
              ? 'Authentication required'
              : 'Permission denied',
          requestId,
        },
        { status: error.status, headers },
      );
    if (error instanceof NewsletterNotFoundError)
      return Response.json(
        { code: 'NOT_FOUND', message: error.message, requestId },
        { status: 404, headers },
      );
    if (error instanceof NewsletterConflictError)
      return Response.json(
        { code: 'CONFLICT', message: error.message, requestId },
        { status: 409, headers },
      );
    if (error instanceof NewsletterBusinessValidationError)
      return Response.json(
        { code: 'VALIDATION_ERROR', message: error.message, requestId },
        { status: 422, headers },
      );
    if (
      error instanceof NewsletterTokenError ||
      error instanceof NewsletterValidationError
    )
      return Response.json(
        { code: 'BAD_REQUEST', message: error.message, requestId },
        { status: 400, headers },
      );
    return Response.json(
      {
        code: 'UNAVAILABLE',
        message: 'Newsletter service is unavailable',
        requestId,
      },
      { status: 503, headers },
    );
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new NewsletterValidationError(
      'Invalid request',
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    );
  return parsed.data;
}

function genericAccepted() {
  return Response.json(
    { status: 'accepted', message: '如果该邮箱可订阅，我们会发送确认邮件。' },
    { status: 202, headers: publicHeaders },
  );
}

async function requestKey(request: Request) {
  const address =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  return hashNewsletterValue(`newsletter:${address}`);
}
