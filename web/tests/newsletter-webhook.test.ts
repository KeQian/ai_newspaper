// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createEmailWebhookHandler } from '@/lib/newsletter/webhook';

const secret = 'webhook-test-secret-with-at-least-32-characters';
const timestamp = '1789286400';
const body = JSON.stringify({
  id: 'event-1',
  messageId: 'message-1',
  type: 'delivered',
  occurredAt: '2026-09-13T08:00:00Z',
});

describe('email webhook', () => {
  it('accepts a fresh valid signature and rejects tampering', async () => {
    const applyEmailEvent = vi.fn().mockResolvedValue(undefined);
    const handler = createEmailWebhookHandler({
      createService: () => ({ applyEmailEvent }) as never,
      secret,
      provider: 'generic',
      now: () => new Date('2026-09-13T08:00:00Z'),
    });
    const signature = await sign(`${timestamp}.${body}`);
    const valid = await handler(request(body, signature), 'generic');
    expect(valid.status).toBe(204);
    expect(applyEmailEvent).toHaveBeenCalledOnce();

    const tampered = await handler(request(`${body} `, signature), 'generic');
    expect(tampered.status).toBe(401);
    expect(applyEmailEvent).toHaveBeenCalledOnce();
  });

  it('rejects stale timestamps before parsing the event', async () => {
    const handler = createEmailWebhookHandler({
      createService: () => ({ applyEmailEvent: vi.fn() }) as never,
      secret,
      provider: 'generic',
      now: () => new Date('2026-09-13T09:00:00Z'),
    });
    expect(
      (
        await handler(
          request(body, await sign(`${timestamp}.${body}`)),
          'generic',
        )
      ).status,
    ).toBe(401);
  });
});

function request(payload: string, signature: string) {
  return new Request('https://example.test/api/v1/webhooks/email/generic', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-email-timestamp': timestamp,
      'x-email-signature': signature,
    },
    body: payload,
  });
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
