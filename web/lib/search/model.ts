import { z } from 'zod';

export const searchQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .transform((value) => value.normalize('NFKC')),
    type: z.enum(['news', 'briefing', 'analysis']).optional(),
    topic: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    sort: z.enum(['relevance', 'latest']).default('relevance'),
    limit: z.coerce.number().int().min(1).max(30).default(20),
    cursor: z.string().max(500).optional(),
  })
  .strict();

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export class SearchValidationError extends Error {
  constructor(message = 'Invalid search request') {
    super(message);
    this.name = 'SearchValidationError';
  }
}

export class SearchRateLimitError extends Error {
  constructor(readonly retryAfter: number) {
    super('Too many search requests');
    this.name = 'SearchRateLimitError';
  }
}
