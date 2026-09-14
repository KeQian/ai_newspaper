// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client';
import { DrizzleNewsletterRepository } from '@/lib/newsletter/drizzle-repository';
import {
  NewsletterBusinessValidationError,
  NewsletterTokenError,
} from '@/lib/newsletter/model';
import { NewsletterService } from '@/lib/newsletter/service';
import { createUnsubscribeToken } from '@/lib/newsletter/token';
import type { EmailAdapter } from '@/lib/newsletter/types';

const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
const secret = 'newsletter-test-secret-with-at-least-32-characters';
const now = new Date('2026-09-13T08:00:00Z');

class CaptureEmailAdapter implements EmailAdapter {
  messages: Array<Parameters<EmailAdapter['send']>[0]> = [];
  async send(message: Parameters<EmailAdapter['send']>[0]) {
    this.messages.push(message);
    return { messageId: `message-${this.messages.length}` };
  }
}

describe('newsletter database workflow', () => {
  let client: PGlite;
  let service: NewsletterService;
  let email: CaptureEmailAdapter;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    email = new CaptureEmailAdapter();
    service = new NewsletterService(
      new DrizzleNewsletterRepository(database as unknown as Database),
      email,
      { publicUrl: 'https://example.test', tokenSecret: secret },
    );
  }, 90_000);

  afterEach(async () => client.close());

  it('keeps repeated subscription generic, confirms once and unsubscribes idempotently', async () => {
    const subscription = {
      email: ' Reader@Example.com ',
      consent: true as const,
      source: 'test',
    };
    await service.subscribe(
      subscription,
      'subscription-key-0001',
      'request-1',
      now,
    );
    await service.subscribe(
      subscription,
      'subscription-key-0001',
      'request-2',
      now,
    );

    const subscribers = await client.query<{
      id: string;
      email_display: string;
      status: string;
    }>('select id, email_display, status from newsletter_subscribers');
    expect(subscribers.rows).toHaveLength(1);
    expect(subscribers.rows[0]).toMatchObject({
      email_display: 'Reader@Example.com',
      status: 'pending',
    });

    await expect(service.processNext(now)).resolves.toMatchObject({
      kind: 'confirmation',
      status: 'sent',
    });
    const confirmation = email.messages[0].confirmUrl;
    expect(confirmation).toContain('/newsletter?confirm=');
    const confirmToken = new URL(confirmation!).searchParams.get('confirm')!;
    await service.confirm(confirmToken, now);
    await service.confirm(confirmToken, now);

    const subscriberId = subscribers.rows[0].id;
    const unsubscribeToken = await createUnsubscribeToken(subscriberId, secret);
    await service.unsubscribe(unsubscribeToken, now);
    await service.unsubscribe(unsubscribeToken, now);
    const state = await client.query<{ status: string }>(
      'select status from newsletter_subscribers where id = $1',
      [subscriberId],
    );
    expect(state.rows[0].status).toBe('unsubscribed');
  });

  it('snapshots only active recipients, sends exactly once and applies signed-provider events idempotently', async () => {
    await seedEditorAndContent(client);
    await service.subscribe(
      { email: 'active@example.com', consent: true, source: 'test' },
      'subscription-key-0002',
      'request-1',
      now,
    );
    await service.processNext(now);
    const token = new URL(email.messages[0].confirmUrl!).searchParams.get(
      'confirm',
    )!;
    await service.confirm(token, now);

    const issue = await service.createIssue(
      {
        issueDate: '2026-09-13',
        subject: '今日 AI 信号',
        preheader: '五分钟看懂变化',
        body: { schemaVersion: 1, type: 'doc', content: [] },
        contentIds: ['20000000-0000-4000-8000-000000000002'],
      },
      '10000000-0000-4000-8000-000000000001',
      'request-issue',
      now,
    );
    await expect(
      service.queueSend(
        issue.id,
        'newsletter-send-key-0001',
        '10000000-0000-4000-8000-000000000001',
        'request-send',
        now,
      ),
    ).resolves.toEqual({ recipientCount: 1 });
    await expect(
      service.queueSend(
        issue.id,
        'newsletter-send-key-0001',
        '10000000-0000-4000-8000-000000000001',
        'request-send-retry',
        now,
      ),
    ).resolves.toEqual({ recipientCount: 1 });
    await expect(service.processNext(now)).resolves.toMatchObject({
      kind: 'issue',
      status: 'sent',
    });
    expect(email.messages.at(-1)).toMatchObject({
      kind: 'issue',
      to: 'active@example.com',
    });
    expect(email.messages.at(-1)?.unsubscribeUrl).toContain(
      '/newsletter?unsubscribe=',
    );

    const event = {
      id: 'event-1',
      messageId: 'message-2',
      type: 'complained' as const,
      occurredAt: new Date('2026-09-13T08:05:00Z'),
    };
    await service.applyEmailEvent('generic', event, now);
    await service.applyEmailEvent('generic', event, now);
    const suppression = await client.query<{ status: string }>(
      "select status from newsletter_subscribers where email_normalized = 'active@example.com'",
    );
    expect(suppression.rows[0].status).toBe('complained');
    const events = await client.query<{ count: number }>(
      'select count(*)::int as count from newsletter_email_events',
    );
    expect(events.rows[0].count).toBe(1);

    const second = await service.createIssue(
      {
        issueDate: '2026-09-14',
        subject: '第二期',
        preheader: '',
        body: { schemaVersion: 1, type: 'doc', content: [] },
        contentIds: [],
      },
      '10000000-0000-4000-8000-000000000001',
      'request-issue-2',
      now,
    );
    await expect(
      service.queueSend(
        second.id,
        'newsletter-send-key-0002',
        '10000000-0000-4000-8000-000000000001',
        'request-send-2',
        now,
      ),
    ).rejects.toBeInstanceOf(NewsletterBusinessValidationError);
  });

  it('rejects expired and tampered confirmation tokens without changing state', async () => {
    await service.subscribe(
      { email: 'expiry@example.com', consent: true },
      'subscription-key-expiry',
      'request-expiry',
      now,
    );
    await service.processNext(now);
    const token = new URL(email.messages[0].confirmUrl!).searchParams.get(
      'confirm',
    )!;
    await expect(service.confirm(`${token}x`, now)).rejects.toBeInstanceOf(
      NewsletterTokenError,
    );
    await expect(
      service.confirm(token, new Date('2026-09-14T08:00:01Z')),
    ).rejects.toBeInstanceOf(NewsletterTokenError);
    const state = await client.query<{ status: string }>(
      "select status from newsletter_subscribers where email_normalized = 'expiry@example.com'",
    );
    expect(state.rows[0].status).toBe('pending');
  });
});

async function seedEditorAndContent(client: PGlite) {
  await client.exec(`
    insert into admin_users (id, email, display_name)
    values ('10000000-0000-4000-8000-000000000001', 'editor@example.com', '编辑部');
    insert into content_items
      (id, content_type, slug, status, verification, title, dek, summary, body,
       importance, actionability, published_at, author_id, ai_disclosure, seo)
    values
      ('20000000-0000-4000-8000-000000000002', 'news', 'published-news',
       'published', 'confirmed', '已发布动态', '', '摘要',
       '{"schemaVersion":1,"type":"doc","content":[]}', 3, 3,
       '2026-09-13T07:00:00Z', '10000000-0000-4000-8000-000000000001', '{}', '{}');
  `);
}
