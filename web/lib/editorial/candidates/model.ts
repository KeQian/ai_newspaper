import { z } from 'zod';

export const candidateStatuses = [
  'new',
  'processing',
  'review',
  'merged',
  'rejected',
  'published',
] as const;

export const candidateListQuerySchema = z
  .object({
    status: z.enum(candidateStatuses).optional(),
    verification: z.enum(['confirmed', 'developing', 'unverified']).optional(),
    risk: z.string().trim().min(1).max(80).optional(),
    source: z.string().trim().min(1).max(120).optional(),
    entity: z.string().trim().min(1).max(120).optional(),
    topic: z.string().trim().min(1).max(120).optional(),
    q: z.string().trim().min(1).max(160).optional(),
    importance: z.coerce.number().int().min(1).max(5).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    includeDeferred: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default('false'),
    sort: z.literal('created_desc').default('created_desc'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(500).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'Invalid date range',
  });

export const candidateDecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_draft'),
    version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000).optional(),
  }),
  z.object({
    action: z.literal('merge'),
    version: z.number().int().positive(),
    targetId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('reject'),
    version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal('defer'),
    version: z.number().int().positive(),
    reason: z.string().trim().min(1).max(1000),
  }),
]);

export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
export type CandidateDecision = z.infer<typeof candidateDecisionSchema>;

export class CandidateConflictError extends Error {
  constructor(message = 'Candidate changed; reload before deciding') {
    super(message);
    this.name = 'CandidateConflictError';
  }
}

export class CandidateNotFoundError extends Error {
  constructor(message = 'Candidate not found') {
    super(message);
    this.name = 'CandidateNotFoundError';
  }
}

export class CandidateDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateDecisionError';
  }
}

export function encodeCandidateCursor(createdAt: Date, id: string): string {
  return btoa(`${createdAt.toISOString()}|${id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function decodeCandidateCursor(cursor: string): {
  createdAt: Date;
  id: string;
} {
  try {
    const normalized = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const decoded = atob(
      normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
    );
    const [dateValue, id, ...extra] = decoded.split('|');
    const createdAt = new Date(dateValue);
    if (
      extra.length ||
      Number.isNaN(createdAt.getTime()) ||
      !z.string().uuid().safeParse(id).success
    ) {
      throw new Error();
    }
    return { createdAt, id };
  } catch {
    throw new CandidateDecisionError('Invalid cursor');
  }
}

export function draftSlug(title: string, id: string): string {
  const stem = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return `${stem || 'candidate'}-${id.slice(0, 8)}`;
}
