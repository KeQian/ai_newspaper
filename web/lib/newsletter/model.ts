import { z } from 'zod';

import { richTextDocumentSchema } from '@/lib/content/model';

export const subscriptionInputSchema = z
  .object({
    email: z.string().trim().email().max(254),
    consent: z.literal(true),
    source: z.string().trim().max(80).optional(),
    website: z.string().max(0).optional(),
  })
  .strict();

export const tokenInputSchema = z
  .object({ token: z.string().min(32).max(1000) })
  .strict();

export const issueInputSchema = z
  .object({
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
        message: 'Invalid issue date',
      }),
    subject: z.string().trim().min(1).max(160),
    preheader: z.string().trim().max(200).default(''),
    body: richTextDocumentSchema,
    contentIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

export const issueUpdateInputSchema = issueInputSchema
  .omit({ issueDate: true })
  .extend({ version: z.number().int().positive() });

export const idempotencyKeySchema = z.string().min(16).max(128);

export const emailEventSchema = z
  .object({
    id: z.string().min(1).max(255),
    messageId: z.string().min(1).max(255),
    type: z.enum([
      'sent',
      'delivered',
      'bounced',
      'complained',
      'unsubscribed',
    ]),
    occurredAt: z.coerce.date(),
    errorCode: z.string().max(120).optional(),
  })
  .strict();

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
export type IssueInput = z.infer<typeof issueInputSchema>;
export type IssueUpdateInput = z.infer<typeof issueUpdateInputSchema>;
export type EmailEvent = z.infer<typeof emailEventSchema>;

export class NewsletterValidationError extends Error {
  constructor(
    message = 'Invalid request',
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'NewsletterValidationError';
  }
}

export class NewsletterNotFoundError extends Error {
  constructor() {
    super('Newsletter issue not found');
    this.name = 'NewsletterNotFoundError';
  }
}

export class NewsletterConflictError extends Error {
  constructor(message = 'Newsletter issue changed; reload before continuing') {
    super(message);
    this.name = 'NewsletterConflictError';
  }
}

export class NewsletterBusinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NewsletterBusinessValidationError';
  }
}

export class NewsletterTokenError extends Error {
  constructor() {
    super('This link is invalid or has expired');
    this.name = 'NewsletterTokenError';
  }
}
