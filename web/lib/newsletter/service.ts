import type { RichTextDocument } from '@/lib/content/model';

import type { EmailAdapter, NewsletterRepository } from './types';
import {
  NewsletterBusinessValidationError,
  NewsletterTokenError,
  type EmailEvent,
  type IssueInput,
  type IssueUpdateInput,
  type SubscriptionInput,
} from './model';
import {
  createOpaqueToken,
  createUnsubscribeToken,
  hashNewsletterValue,
} from './token';

export class NewsletterService {
  constructor(
    private readonly repository: NewsletterRepository,
    private readonly email: EmailAdapter,
    private readonly config: { publicUrl: string; tokenSecret: string },
  ) {
    if (config.tokenSecret.length < 32)
      throw new Error(
        'NEWSLETTER_TOKEN_SECRET must contain at least 32 characters',
      );
  }

  async subscribe(
    subscription: SubscriptionInput,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ) {
    const subscriberId = crypto.randomUUID();
    const emailDisplay = subscription.email.trim();
    const emailNormalized = emailDisplay.toLocaleLowerCase('en-US');
    const unsubscribeToken = await createUnsubscribeToken(
      subscriberId,
      this.config.tokenSecret,
    );
    await this.repository.requestSubscription({
      subscriberId,
      subscription: { ...subscription, email: emailDisplay },
      emailNormalized,
      idempotencyKeyHash: await hashNewsletterValue(idempotencyKey),
      emailHash: await hashNewsletterValue(emailNormalized),
      placeholderConfirmHash: await hashNewsletterValue(createOpaqueToken()),
      unsubscribeTokenHash: await hashNewsletterValue(unsubscribeToken),
      confirmExpiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
      requestId,
      now,
    });
  }

  async confirm(
    token: string,
    now = new Date(),
    requestId = crypto.randomUUID(),
  ) {
    if (
      (await this.repository.confirm(
        await hashNewsletterValue(token),
        now,
        requestId,
      )) === 'invalid'
    )
      throw new NewsletterTokenError();
  }

  async unsubscribe(
    token: string,
    now = new Date(),
    requestId = crypto.randomUUID(),
  ) {
    await this.repository.unsubscribe(
      await hashNewsletterValue(token),
      now,
      requestId,
    );
  }

  listIssues() {
    return this.repository.listIssues();
  }

  getIssue(id: string) {
    return this.repository.getIssue(id);
  }

  createIssue(
    input: IssueInput,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.createIssue(input, actorId, requestId, now);
  }

  updateIssue(
    id: string,
    input: IssueUpdateInput,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.updateIssue(id, input, actorId, requestId, now);
  }

  queueTest(
    id: string,
    adminEmail: string,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    return this.repository.queueTest(id, adminEmail, actorId, requestId, now);
  }

  async queueSend(
    id: string,
    idempotencyKey: string,
    actorId: string,
    requestId: string,
    now = new Date(),
  ) {
    const recipientCount = await this.repository.queueSend(
      id,
      await hashNewsletterValue(idempotencyKey),
      actorId,
      requestId,
      now,
    );
    if (!recipientCount)
      throw new NewsletterBusinessValidationError(
        'No active recipients are available',
      );
    return { recipientCount };
  }

  async processNext(now = new Date()) {
    const job = await this.repository.claimEmailJob(now);
    if (!job) return null;
    try {
      if (job.kind === 'confirmation') {
        const token = createOpaqueToken();
        await this.repository.setConfirmationToken(
          job.subscriberId,
          await hashNewsletterValue(token),
          new Date(now.getTime() + 24 * 60 * 60_000),
          now,
        );
        const sent = await this.email.send({
          to: job.email,
          subject: '确认订阅 AI Signal',
          preheader: '请在 24 小时内确认你的免费订阅',
          body: confirmationBody,
          confirmUrl: `${this.config.publicUrl}/newsletter?confirm=${encodeURIComponent(token)}`,
          kind: 'confirmation',
        });
        await this.repository.completeEmailJob(job, sent.messageId, now);
      } else if (job.kind === 'test') {
        const sent = await this.email.send({
          to: job.email,
          subject: `[测试] ${job.issue.subject}`,
          preheader: job.issue.preheader,
          body: job.issue.body,
          kind: 'test',
        });
        await this.repository.completeEmailJob(job, sent.messageId, now);
      } else {
        const unsubscribeToken = await createUnsubscribeToken(
          job.recipient.subscriberId,
          this.config.tokenSecret,
        );
        const sent = await this.email.send({
          to: job.recipient.email,
          subject: job.recipient.issue.subject,
          preheader: job.recipient.issue.preheader,
          body: job.recipient.issue.body,
          unsubscribeUrl: `${this.config.publicUrl}/newsletter?unsubscribe=${encodeURIComponent(unsubscribeToken)}`,
          kind: 'issue',
        });
        await this.repository.completeEmailJob(job, sent.messageId, now);
      }
      return { kind: job.kind, status: 'sent' as const };
    } catch {
      await this.repository.failEmailJob(job, 'EMAIL_PROVIDER_ERROR', now);
      return { kind: job.kind, status: 'failed' as const };
    }
  }

  applyEmailEvent(provider: string, event: EmailEvent, now = new Date()) {
    return this.repository.applyEmailEvent(provider, event, now);
  }
}

const confirmationBody: RichTextDocument = {
  schemaVersion: 1,
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '确认后，你将收到经过编辑审核的 AI 热点日报。若不是你本人提交，可忽略此邮件。',
        },
      ],
    },
  ],
};
