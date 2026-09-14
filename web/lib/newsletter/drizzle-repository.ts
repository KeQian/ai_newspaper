import { and, asc, desc, eq, inArray, lte, or, sql } from 'drizzle-orm';

import type { Database } from '@/db/client';
import {
  auditLogs,
  contentItems,
  newsletterDeliveries,
  newsletterEmailEvents,
  newsletterIssueContents,
  newsletterIssues,
  newsletterSubscribers,
  newsletterSubscriptionRequests,
  outboxEvents,
} from '@/db/schema';
import { richTextDocumentSchema } from '@/lib/content/model';

import {
  NewsletterBusinessValidationError,
  NewsletterConflictError,
  NewsletterNotFoundError,
} from './model';
import type {
  EmailJob,
  NewsletterIssueDetail,
  NewsletterIssueSummary,
  NewsletterRepository,
} from './types';

// oxlint-disable-next-line typescript/no-explicit-any
type Transaction = any;

const emailEventTypes = [
  'newsletter.confirmation.requested',
  'newsletter.test.requested',
  'newsletter.delivery.requested',
] as const;

export class DrizzleNewsletterRepository implements NewsletterRepository {
  constructor(private readonly database: Database) {}

  async requestSubscription(
    input: Parameters<NewsletterRepository['requestSubscription']>[0],
  ) {
    await this.database.transaction(async (transaction: Transaction) => {
      const [accepted] = await transaction
        .insert(newsletterSubscriptionRequests)
        .values({
          keyHash: input.idempotencyKeyHash,
          emailHash: input.emailHash,
          expiresAt: new Date(input.now.getTime() + 24 * 60 * 60_000),
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: newsletterSubscriptionRequests.keyHash })
        .returning({ keyHash: newsletterSubscriptionRequests.keyHash });
      if (!accepted) return;

      const [created] = await transaction
        .insert(newsletterSubscribers)
        .values({
          id: input.subscriberId,
          emailNormalized: input.emailNormalized,
          emailDisplay: input.subscription.email,
          status: 'pending',
          confirmTokenHash: input.placeholderConfirmHash,
          confirmExpiresAt: input.confirmExpiresAt,
          unsubscribeTokenHash: input.unsubscribeTokenHash,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: newsletterSubscribers.emailNormalized })
        .returning({ id: newsletterSubscribers.id });
      const [existing] = created
        ? [null]
        : await transaction
            .select({
              id: newsletterSubscribers.id,
              status: newsletterSubscribers.status,
              confirmExpiresAt: newsletterSubscribers.confirmExpiresAt,
            })
            .from(newsletterSubscribers)
            .where(
              eq(newsletterSubscribers.emailNormalized, input.emailNormalized),
            )
            .for('update')
            .limit(1);
      if (
        existing &&
        (['active', 'bounced', 'complained'].includes(existing.status) ||
          (existing.status === 'pending' &&
            existing.confirmExpiresAt !== null &&
            existing.confirmExpiresAt >= input.now))
      )
        return;

      if (!existing && !created)
        throw new Error('Subscriber upsert did not return a row');
      const subscriberId = existing?.id ?? created.id;
      if (existing) {
        await transaction
          .update(newsletterSubscribers)
          .set({
            emailDisplay: input.subscription.email,
            status: 'pending',
            confirmTokenHash: input.placeholderConfirmHash,
            confirmExpiresAt: input.confirmExpiresAt,
            confirmedAt: null,
            unsubscribedAt: null,
            updatedAt: input.now,
          })
          .where(eq(newsletterSubscribers.id, subscriberId));
      }
      await transaction.insert(outboxEvents).values({
        eventType: 'newsletter.confirmation.requested',
        payload: { subscriberId },
        availableAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await audit(transaction, {
        action: 'newsletter.subscription.requested',
        objectId: subscriberId,
        requestId: input.requestId,
        after: { status: 'pending', source: input.subscription.source ?? null },
        now: input.now,
      });
    });
  }

  async setConfirmationToken(
    subscriberId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ) {
    await this.database
      .update(newsletterSubscribers)
      .set({
        confirmTokenHash: tokenHash,
        confirmExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(newsletterSubscribers.id, subscriberId),
          eq(newsletterSubscribers.status, 'pending'),
        ),
      );
  }

  async confirm(tokenHash: string, now: Date, requestId: string) {
    return this.database.transaction(async (transaction: Transaction) => {
      const [subscriber] = await transaction
        .select({
          id: newsletterSubscribers.id,
          status: newsletterSubscribers.status,
          expiresAt: newsletterSubscribers.confirmExpiresAt,
        })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.confirmTokenHash, tokenHash))
        .for('update')
        .limit(1);
      if (!subscriber) return 'invalid' as const;
      if (subscriber.status === 'active') return 'confirmed' as const;
      if (
        subscriber.status !== 'pending' ||
        !subscriber.expiresAt ||
        subscriber.expiresAt < now
      )
        return 'invalid' as const;
      await transaction
        .update(newsletterSubscribers)
        .set({ status: 'active', confirmedAt: now, updatedAt: now })
        .where(eq(newsletterSubscribers.id, subscriber.id));
      await audit(transaction, {
        action: 'newsletter.subscription.confirmed',
        objectId: subscriber.id,
        requestId,
        before: { status: 'pending' },
        after: { status: 'active' },
        now,
      });
      return 'confirmed' as const;
    });
  }

  async unsubscribe(tokenHash: string, now: Date, requestId: string) {
    await this.database.transaction(async (transaction: Transaction) => {
      const [subscriber] = await transaction
        .select({
          id: newsletterSubscribers.id,
          status: newsletterSubscribers.status,
        })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.unsubscribeTokenHash, tokenHash))
        .for('update')
        .limit(1);
      if (!subscriber || subscriber.status === 'unsubscribed') return;
      await transaction
        .update(newsletterSubscribers)
        .set({ status: 'unsubscribed', unsubscribedAt: now, updatedAt: now })
        .where(eq(newsletterSubscribers.id, subscriber.id));
      await audit(transaction, {
        action: 'newsletter.subscription.unsubscribed',
        objectId: subscriber.id,
        requestId,
        before: { status: subscriber.status },
        after: { status: 'unsubscribed' },
        now,
      });
    });
  }

  async listIssues() {
    const rows = await issueRows(this.database);
    return rows.map(mapIssueSummary);
  }

  async getIssue(id: string) {
    return loadIssue(this.database, id);
  }

  async createIssue(
    input: Parameters<NewsletterRepository['createIssue']>[0],
    actorId: string,
    requestId: string,
    now: Date,
  ) {
    return this.database.transaction(async (transaction: Transaction) => {
      await ensurePublishedContent(transaction, input.contentIds);
      const id = crypto.randomUUID();
      await transaction.insert(newsletterIssues).values({
        id,
        issueDate: input.issueDate,
        subject: input.subject,
        preheader: input.preheader,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });
      await replaceIssueContents(transaction, id, input.contentIds, now);
      await audit(transaction, {
        actorId,
        action: 'newsletter.issue.created',
        objectId: id,
        requestId,
        after: { status: 'draft', version: 1 },
        now,
      });
      return requireIssue(await loadIssue(transaction, id));
    });
  }

  async updateIssue(
    id: string,
    input: Parameters<NewsletterRepository['updateIssue']>[1],
    actorId: string,
    requestId: string,
    now: Date,
  ) {
    return this.database.transaction(async (transaction: Transaction) => {
      const [current] = await transaction
        .select({
          status: newsletterIssues.status,
          version: newsletterIssues.version,
        })
        .from(newsletterIssues)
        .where(eq(newsletterIssues.id, id))
        .for('update')
        .limit(1);
      if (!current) throw new NewsletterNotFoundError();
      if (current.version !== input.version)
        throw new NewsletterConflictError();
      if (current.status !== 'draft')
        throw new NewsletterConflictError('Only draft issues can be edited');
      await ensurePublishedContent(transaction, input.contentIds);
      await transaction
        .update(newsletterIssues)
        .set({
          subject: input.subject,
          preheader: input.preheader,
          body: input.body,
          version: current.version + 1,
          updatedAt: now,
        })
        .where(eq(newsletterIssues.id, id));
      await replaceIssueContents(transaction, id, input.contentIds, now);
      await audit(transaction, {
        actorId,
        action: 'newsletter.issue.updated',
        objectId: id,
        requestId,
        before: { version: current.version },
        after: { version: current.version + 1 },
        now,
      });
      return requireIssue(await loadIssue(transaction, id));
    });
  }

  async queueTest(
    id: string,
    recipient: string,
    actorId: string,
    requestId: string,
    now: Date,
  ) {
    await this.database.transaction(async (transaction: Transaction) => {
      requireIssue(await loadIssue(transaction, id));
      await transaction.insert(outboxEvents).values({
        eventType: 'newsletter.test.requested',
        payload: { issueId: id, recipient },
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await audit(transaction, {
        actorId,
        action: 'newsletter.issue.test_queued',
        objectId: id,
        requestId,
        after: { recipient: 'current_admin' },
        now,
      });
    });
  }

  async queueSend(
    id: string,
    idempotencyKeyHash: string,
    actorId: string,
    requestId: string,
    now: Date,
  ) {
    return this.database.transaction(async (transaction: Transaction) => {
      const [issue] = await transaction
        .select({
          status: newsletterIssues.status,
          keyHash: newsletterIssues.sendIdempotencyKeyHash,
        })
        .from(newsletterIssues)
        .where(eq(newsletterIssues.id, id))
        .for('update')
        .limit(1);
      if (!issue) throw new NewsletterNotFoundError();
      if (issue.keyHash === idempotencyKeyHash) {
        const [count] = await transaction
          .select({ value: sql<number>`count(*)::int` })
          .from(newsletterDeliveries)
          .where(eq(newsletterDeliveries.issueId, id));
        return Number(count?.value ?? 0);
      }
      if (issue.status !== 'draft' || issue.keyHash)
        throw new NewsletterConflictError('Issue has already been queued');

      const recipients = await transaction
        .select({ id: newsletterSubscribers.id })
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.status, 'active'));
      if (!recipients.length)
        throw new NewsletterBusinessValidationError(
          'No active recipients are available',
        );
      const deliveries = recipients.map(
        ({ id: subscriberId }: { id: string }) => ({
          id: crypto.randomUUID(),
          issueId: id,
          subscriberId,
          createdAt: now,
          updatedAt: now,
          lastEventAt: now,
        }),
      );
      await transaction.insert(newsletterDeliveries).values(deliveries);
      await transaction.insert(outboxEvents).values(
        deliveries.map((delivery: { id: string }) => ({
          eventType: 'newsletter.delivery.requested',
          payload: { deliveryId: delivery.id },
          availableAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      );
      await transaction
        .update(newsletterIssues)
        .set({
          status: 'sending',
          sendIdempotencyKeyHash: idempotencyKeyHash,
          updatedAt: now,
        })
        .where(eq(newsletterIssues.id, id));
      await audit(transaction, {
        actorId,
        action: 'newsletter.issue.send_queued',
        objectId: id,
        requestId,
        before: { status: 'draft' },
        after: { status: 'sending', recipientCount: deliveries.length },
        now,
      });
      return deliveries.length;
    });
  }

  async claimEmailJob(now: Date): Promise<EmailJob | null> {
    return this.database.transaction(async (transaction: Transaction) => {
      const [event] = await transaction
        .select({
          id: outboxEvents.id,
          eventType: outboxEvents.eventType,
          payload: outboxEvents.payload,
        })
        .from(outboxEvents)
        .where(
          and(
            inArray(outboxEvents.eventType, emailEventTypes),
            or(
              eq(outboxEvents.status, 'pending'),
              eq(outboxEvents.status, 'failed'),
            ),
            lte(outboxEvents.availableAt, now),
          ),
        )
        .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.id))
        .for('update', { skipLocked: true })
        .limit(1);
      if (!event) return null;
      await transaction
        .update(outboxEvents)
        .set({
          status: 'processing',
          attempts: sql`${outboxEvents.attempts} + 1`,
          updatedAt: now,
        })
        .where(eq(outboxEvents.id, event.id));
      const payload = event.payload as Record<string, unknown>;
      if (event.eventType === 'newsletter.confirmation.requested') {
        const [subscriber] = await transaction
          .select({
            id: newsletterSubscribers.id,
            email: newsletterSubscribers.emailDisplay,
          })
          .from(newsletterSubscribers)
          .where(
            and(
              eq(newsletterSubscribers.id, String(payload.subscriberId)),
              eq(newsletterSubscribers.status, 'pending'),
            ),
          )
          .limit(1);
        if (subscriber)
          return {
            kind: 'confirmation' as const,
            outboxId: event.id,
            subscriberId: subscriber.id,
            email: subscriber.email,
          };
      }
      if (event.eventType === 'newsletter.test.requested') {
        const issue = await loadIssue(transaction, String(payload.issueId));
        if (issue)
          return {
            kind: 'test' as const,
            outboxId: event.id,
            email: String(payload.recipient),
            issue,
          };
      }
      if (event.eventType === 'newsletter.delivery.requested') {
        const recipient = await loadDelivery(
          transaction,
          String(payload.deliveryId),
        );
        if (recipient)
          return { kind: 'issue' as const, outboxId: event.id, recipient };
      }
      await transaction
        .update(outboxEvents)
        .set({ status: 'processed', processedAt: now, updatedAt: now })
        .where(eq(outboxEvents.id, event.id));
      return null;
    });
  }

  async completeEmailJob(job: EmailJob, providerMessageId: string, now: Date) {
    await this.database.transaction(async (transaction: Transaction) => {
      await transaction
        .update(outboxEvents)
        .set({ status: 'processed', processedAt: now, updatedAt: now })
        .where(eq(outboxEvents.id, job.outboxId));
      if (job.kind !== 'issue') return;
      await transaction
        .update(newsletterDeliveries)
        .set({
          status: 'sent',
          providerMessageId,
          lastEventAt: now,
          updatedAt: now,
        })
        .where(eq(newsletterDeliveries.id, job.recipient.deliveryId));
      await finishIssueIfComplete(transaction, job.recipient.issue.id, now);
    });
  }

  async failEmailJob(job: EmailJob, errorCode: string, now: Date) {
    await this.database.transaction(async (transaction: Transaction) => {
      await transaction
        .update(outboxEvents)
        .set({
          status: 'failed',
          availableAt: new Date(now.getTime() + 5 * 60_000),
          updatedAt: now,
        })
        .where(eq(outboxEvents.id, job.outboxId));
      if (job.kind === 'issue')
        await transaction
          .update(newsletterDeliveries)
          .set({
            status: 'failed',
            errorCode,
            lastEventAt: now,
            updatedAt: now,
          })
          .where(eq(newsletterDeliveries.id, job.recipient.deliveryId));
    });
  }

  async applyEmailEvent(
    provider: string,
    event: Parameters<NewsletterRepository['applyEmailEvent']>[1],
    now: Date,
  ) {
    await this.database.transaction(async (transaction: Transaction) => {
      const [accepted] = await transaction
        .insert(newsletterEmailEvents)
        .values({
          provider,
          providerEventId: event.id,
          providerMessageId: event.messageId,
          eventType: event.type,
          occurredAt: event.occurredAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: newsletterEmailEvents.id });
      if (!accepted) return;
      const [delivery] = await transaction
        .select({
          id: newsletterDeliveries.id,
          subscriberId: newsletterDeliveries.subscriberId,
          lastEventAt: newsletterDeliveries.lastEventAt,
        })
        .from(newsletterDeliveries)
        .where(eq(newsletterDeliveries.providerMessageId, event.messageId))
        .for('update')
        .limit(1);
      if (!delivery || event.occurredAt < delivery.lastEventAt) return;
      if (event.type !== 'unsubscribed')
        await transaction
          .update(newsletterDeliveries)
          .set({
            status: event.type,
            errorCode: event.errorCode ?? null,
            lastEventAt: event.occurredAt,
            updatedAt: now,
          })
          .where(eq(newsletterDeliveries.id, delivery.id));
      if (['bounced', 'complained', 'unsubscribed'].includes(event.type))
        await transaction
          .update(newsletterSubscribers)
          .set({
            status: event.type === 'unsubscribed' ? 'unsubscribed' : event.type,
            unsubscribedAt:
              event.type === 'unsubscribed' ? event.occurredAt : null,
            updatedAt: now,
          })
          .where(eq(newsletterSubscribers.id, delivery.subscriberId));
    });
  }
}

async function issueRows(database: Transaction, id?: string) {
  return database
    .select({
      id: newsletterIssues.id,
      issueDate: newsletterIssues.issueDate,
      subject: newsletterIssues.subject,
      preheader: newsletterIssues.preheader,
      status: newsletterIssues.status,
      scheduledAt: newsletterIssues.scheduledAt,
      sentAt: newsletterIssues.sentAt,
      version: newsletterIssues.version,
      queuedCount: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'queued')::int`,
      deliveredCount: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'delivered')::int`,
      bouncedCount: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'bounced')::int`,
      complainedCount: sql<number>`count(*) filter (where ${newsletterDeliveries.status} = 'complained')::int`,
      unsubscribedCount: sql<number>`(
        select count(*)::int
        from ${newsletterEmailEvents} nee
        inner join ${newsletterDeliveries} nd on nd.provider_message_id = nee.provider_message_id
        where nd.issue_id = ${newsletterIssues.id} and nee.event_type = 'unsubscribed'
      )`,
    })
    .from(newsletterIssues)
    .leftJoin(
      newsletterDeliveries,
      eq(newsletterIssues.id, newsletterDeliveries.issueId),
    )
    .where(id ? eq(newsletterIssues.id, id) : undefined)
    .groupBy(newsletterIssues.id)
    .orderBy(desc(newsletterIssues.issueDate), desc(newsletterIssues.id));
}

function mapIssueSummary(row: Record<string, unknown>): NewsletterIssueSummary {
  return {
    id: String(row.id),
    issueDate: String(row.issueDate),
    subject: String(row.subject),
    preheader: String(row.preheader),
    status: row.status as NewsletterIssueSummary['status'],
    scheduledAt: (row.scheduledAt as Date | null) ?? null,
    sentAt: (row.sentAt as Date | null) ?? null,
    version: Number(row.version),
    queuedCount: Number(row.queuedCount),
    deliveredCount: Number(row.deliveredCount),
    bouncedCount: Number(row.bouncedCount),
    complainedCount: Number(row.complainedCount),
    unsubscribedCount: Number(row.unsubscribedCount),
  };
}

async function loadIssue(
  database: Transaction,
  id: string,
): Promise<NewsletterIssueDetail | null> {
  const [summary] = await issueRows(database, id);
  if (!summary) return null;
  const [bodyRow, contents] = await Promise.all([
    database
      .select({ body: newsletterIssues.body })
      .from(newsletterIssues)
      .where(eq(newsletterIssues.id, id))
      .limit(1)
      .then((rows: Array<{ body: unknown }>) => rows[0]),
    database
      .select({ contentId: newsletterIssueContents.contentId })
      .from(newsletterIssueContents)
      .where(eq(newsletterIssueContents.issueId, id))
      .orderBy(asc(newsletterIssueContents.position)),
  ]);
  return {
    ...mapIssueSummary(summary),
    body: richTextDocumentSchema.parse(bodyRow.body),
    contentIds: contents.map(
      ({ contentId }: { contentId: string }) => contentId,
    ),
  };
}

async function loadDelivery(database: Transaction, id: string) {
  const [row] = await database
    .select({
      deliveryId: newsletterDeliveries.id,
      subscriberId: newsletterSubscribers.id,
      email: newsletterSubscribers.emailDisplay,
      issueId: newsletterDeliveries.issueId,
    })
    .from(newsletterDeliveries)
    .innerJoin(
      newsletterSubscribers,
      eq(newsletterDeliveries.subscriberId, newsletterSubscribers.id),
    )
    .where(
      and(
        eq(newsletterDeliveries.id, id),
        or(
          eq(newsletterDeliveries.status, 'queued'),
          eq(newsletterDeliveries.status, 'failed'),
        ),
        eq(newsletterSubscribers.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    deliveryId: row.deliveryId,
    subscriberId: row.subscriberId,
    email: row.email,
    issue: requireIssue(await loadIssue(database, row.issueId)),
  };
}

async function ensurePublishedContent(
  transaction: Transaction,
  contentIds: string[],
) {
  if (!contentIds.length) return;
  const rows = await transaction
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(
      and(
        inArray(contentItems.id, contentIds),
        inArray(contentItems.status, ['published', 'updated']),
      ),
    );
  if (
    new Set(rows.map(({ id }: { id: string }) => id)).size !==
    new Set(contentIds).size
  )
    throw new NewsletterBusinessValidationError(
      'Every selected item must be published',
    );
}

async function replaceIssueContents(
  transaction: Transaction,
  issueId: string,
  contentIds: string[],
  now: Date,
) {
  await transaction
    .delete(newsletterIssueContents)
    .where(eq(newsletterIssueContents.issueId, issueId));
  if (contentIds.length)
    await transaction.insert(newsletterIssueContents).values(
      contentIds.map((contentId, position) => ({
        issueId,
        contentId,
        position,
        createdAt: now,
        updatedAt: now,
      })),
    );
}

async function finishIssueIfComplete(
  transaction: Transaction,
  issueId: string,
  now: Date,
) {
  const [counts] = await transaction
    .select({
      unfinished: sql<number>`count(*) filter (where ${newsletterDeliveries.status} in ('queued', 'failed'))::int`,
    })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.issueId, issueId));
  if (Number(counts?.unfinished ?? 0) === 0)
    await transaction
      .update(newsletterIssues)
      .set({ status: 'sent', sentAt: now, updatedAt: now })
      .where(eq(newsletterIssues.id, issueId));
}

function requireIssue(issue: NewsletterIssueDetail | null) {
  if (!issue) throw new NewsletterNotFoundError();
  return issue;
}

async function audit(
  transaction: Transaction,
  input: {
    actorId?: string;
    action: string;
    objectId: string;
    requestId: string;
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
    now: Date;
  },
) {
  await transaction.insert(auditLogs).values({
    actorId: input.actorId,
    action: input.action,
    objectType: 'newsletter',
    objectId: input.objectId,
    requestId: input.requestId,
    before: input.before,
    after: input.after,
    createdAt: input.now,
    updatedAt: input.now,
  });
}
