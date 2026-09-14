import type { RichTextDocument } from '@/lib/content/model';

import type {
  EmailEvent,
  IssueInput,
  IssueUpdateInput,
  SubscriptionInput,
} from './model';

export type NewsletterIssueSummary = {
  id: string;
  issueDate: string;
  subject: string;
  preheader: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduledAt: Date | null;
  sentAt: Date | null;
  version: number;
  queuedCount: number;
  deliveredCount: number;
  bouncedCount: number;
  complainedCount: number;
  unsubscribedCount: number;
};

export type NewsletterIssueDetail = NewsletterIssueSummary & {
  body: RichTextDocument;
  contentIds: string[];
};

export type DeliveryRecipient = {
  deliveryId: string;
  subscriberId: string;
  email: string;
  issue: NewsletterIssueDetail;
};

export type EmailJob =
  | {
      kind: 'confirmation';
      outboxId: string;
      subscriberId: string;
      email: string;
    }
  | {
      kind: 'test';
      outboxId: string;
      email: string;
      issue: NewsletterIssueDetail;
    }
  | {
      kind: 'issue';
      outboxId: string;
      recipient: DeliveryRecipient;
    };

export interface NewsletterRepository {
  requestSubscription(input: {
    subscriberId: string;
    subscription: SubscriptionInput;
    emailNormalized: string;
    idempotencyKeyHash: string;
    emailHash: string;
    placeholderConfirmHash: string;
    unsubscribeTokenHash: string;
    confirmExpiresAt: Date;
    requestId: string;
    now: Date;
  }): Promise<void>;
  setConfirmationToken(
    subscriberId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<void>;
  claimEmailJob(now: Date): Promise<EmailJob | null>;
  completeEmailJob(
    job: EmailJob,
    providerMessageId: string,
    now: Date,
  ): Promise<void>;
  confirm(
    tokenHash: string,
    now: Date,
    requestId: string,
  ): Promise<'confirmed' | 'invalid'>;
  unsubscribe(tokenHash: string, now: Date, requestId: string): Promise<void>;
  listIssues(): Promise<NewsletterIssueSummary[]>;
  getIssue(id: string): Promise<NewsletterIssueDetail | null>;
  createIssue(
    input: IssueInput,
    actorId: string,
    requestId: string,
    now: Date,
  ): Promise<NewsletterIssueDetail>;
  updateIssue(
    id: string,
    input: IssueUpdateInput,
    actorId: string,
    requestId: string,
    now: Date,
  ): Promise<NewsletterIssueDetail>;
  queueTest(
    id: string,
    recipient: string,
    actorId: string,
    requestId: string,
    now: Date,
  ): Promise<void>;
  queueSend(
    id: string,
    idempotencyKeyHash: string,
    actorId: string,
    requestId: string,
    now: Date,
  ): Promise<number>;
  completeEmailJob(
    job: EmailJob,
    providerMessageId: string,
    now: Date,
  ): Promise<void>;
  failEmailJob(job: EmailJob, errorCode: string, now: Date): Promise<void>;
  applyEmailEvent(
    provider: string,
    event: EmailEvent,
    now: Date,
  ): Promise<void>;
}

export interface EmailAdapter {
  send(message: {
    to: string;
    subject: string;
    preheader: string;
    body: RichTextDocument;
    confirmUrl?: string;
    unsubscribeUrl?: string;
    kind: 'confirmation' | 'test' | 'issue';
  }): Promise<{ messageId: string }>;
}
