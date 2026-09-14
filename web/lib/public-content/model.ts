import { z } from 'zod';

export const publicContentQuerySchema = z
  .object({
    type: z.enum(['news', 'briefing', 'analysis']).optional(),
    topic: z.string().trim().min(1).max(120).optional(),
    verification: z.enum(['confirmed', 'developing', 'unverified']).optional(),
    importanceMin: z.coerce.number().int().min(1).max(5).optional(),
    source: z.string().trim().min(1).max(120).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.from && query.to && query.from > query.to)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'to must not be earlier than from',
      });
  });

export const briefingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'Invalid date',
  });

export const publicSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type PublicContentQuery = z.infer<typeof publicContentQuerySchema>;

export class PublicContentNotFoundError extends Error {
  constructor() {
    super('Content not found');
    this.name = 'PublicContentNotFoundError';
  }
}

export class PublicContentValidationError extends Error {
  constructor(message = 'Invalid request') {
    super(message);
    this.name = 'PublicContentValidationError';
  }
}
