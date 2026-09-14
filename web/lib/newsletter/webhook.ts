import { emailEventSchema, NewsletterValidationError } from './model';
import type { NewsletterService } from './service';

export function createEmailWebhookHandler(input: {
  createService: () => NewsletterService;
  secret: string;
  provider: string;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return async (request: Request, provider: string) => {
    const requestId =
      request.headers.get('x-request-id') ?? crypto.randomUUID();
    try {
      if (provider !== input.provider || input.secret.length < 32)
        return unauthorized(requestId);
      const timestamp = request.headers.get('x-email-timestamp');
      const signature = request.headers.get('x-email-signature');
      const rawBody = await request.text();
      if (!timestamp || !signature || !/^\d{10,13}$/u.test(timestamp))
        return unauthorized(requestId);
      const milliseconds =
        timestamp.length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
      if (
        !Number.isFinite(milliseconds) ||
        Math.abs(now().getTime() - milliseconds) > 5 * 60_000
      )
        return unauthorized(requestId);
      if (
        !(await validSignature(
          input.secret,
          `${timestamp}.${rawBody}`,
          signature,
        ))
      )
        return unauthorized(requestId);
      const parsed = emailEventSchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) throw new NewsletterValidationError();
      await input.createService().applyEmailEvent(provider, parsed.data, now());
      return new Response(null, { status: 204 });
    } catch (error) {
      if (
        error instanceof NewsletterValidationError ||
        error instanceof SyntaxError
      )
        return Response.json(
          { code: 'BAD_REQUEST', message: 'Invalid event', requestId },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      return Response.json(
        { code: 'UNAVAILABLE', message: 'Webhook unavailable', requestId },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}

async function validSignature(
  secret: string,
  payload: string,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/iu.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    Uint8Array.from(signature.match(/.{2}/gu) ?? [], (byte) =>
      Number.parseInt(byte, 16),
    ),
    new TextEncoder().encode(payload),
  );
}

function unauthorized(requestId: string) {
  return Response.json(
    { code: 'UNAUTHORIZED', message: 'Invalid webhook signature', requestId },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}
