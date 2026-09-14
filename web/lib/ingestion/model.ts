import { z } from 'zod';

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required');

export const sourceTypeSchema = z.enum([
  'api',
  'rss',
  'atom',
  'web',
  'github',
  'manual',
]);
export const reliabilitySchema = z.enum(['s0', 's1', 's2', 's3', 's4']);
export const sourceScheduleSchema = z.enum([
  'hourly',
  'every_2_hours',
  'daily_0500',
]);
export const registryTermsStatusSchema = z.enum([
  'approved_api',
  'approved_api_with_fair_access',
  'review_before_launch',
]);
export const registryRetentionSchema = z.enum([
  'metadata_and_excerpt',
  'metadata_and_abstract',
]);

const registryDefaultsSchema = z
  .object({
    timezone: z.literal('Asia/Shanghai'),
    user_agent: z.string().min(10).max(300),
    respect_robots: z.literal(true),
    max_document_bytes: z.number().int().positive().max(10_485_760),
    request_timeout_seconds: z.number().int().min(1).max(60),
    retry: z
      .object({
        attempts: z.number().int().min(1).max(5),
        strategy: z.literal('exponential'),
        max_delay_seconds: z.number().int().min(1).max(900),
      })
      .strict(),
  })
  .strict();

export const registrySourceSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    name: z.string().min(1).max(200),
    organization: z.string().min(1).max(160),
    category: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(80),
    source_type: sourceTypeSchema,
    reliability: reliabilitySchema,
    endpoint: httpsUrl,
    query: z.string().min(1).max(1000).optional(),
    parser: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(120),
    schedule: sourceScheduleSchema,
    auth_env: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    retention: registryRetentionSchema,
    terms_status: registryTermsStatusSchema,
    publication_policy: z.enum(['candidate_only', 'discovery_only']),
    enabled: z.boolean(),
    owner: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(80),
  })
  .strict();

export const sourceRegistrySchema = z
  .object({
    version: z.literal(1),
    defaults: registryDefaultsSchema,
    sources: z.array(registrySourceSchema).min(1).max(50),
    restricted_sources: z.array(
      z
        .object({
          id: z.string().min(1).max(120),
          reason: z.string().min(1).max(500),
        })
        .strict(),
    ),
    notes: z.array(z.string().min(1).max(1000)),
  })
  .strict()
  .superRefine((registry, context) => {
    const keys = new Set<string>();
    for (const [index, source] of registry.sources.entries()) {
      if (keys.has(source.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source ids must be unique',
          path: ['sources', index, 'id'],
        });
      }
      keys.add(source.id);
    }
  });

export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;
export type RegistrySource = z.infer<typeof registrySourceSchema>;

export const ingestionRunInputSchema = z
  .object({
    jobKey: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    scheduledAt: z.string().datetime({ offset: true }),
    sources: z.array(z.string().min(1).max(120)).min(1).max(50),
    cursor: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.sources).size !== input.sources.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sources must be unique',
        path: ['sources'],
      });
    }

    for (const [key, value] of Object.entries(input.cursor ?? {})) {
      if (!input.sources.includes(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Cursor keys must reference requested sources',
          path: ['cursor', key],
        });
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each source cursor must be an object',
          path: ['cursor', key],
        });
      }
    }
  });

export type IngestionRunInput = z.infer<typeof ingestionRunInputSchema>;
export type SourceHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'failing'
  | 'stale'
  | 'unknown';

export class IngestionValidationError extends Error {
  readonly status = 422;

  constructor(message = 'Invalid ingestion request') {
    super(message);
    this.name = 'IngestionValidationError';
  }
}

export class IngestionConflictError extends Error {
  readonly status = 409;

  constructor(message = 'Ingestion run conflict') {
    super(message);
    this.name = 'IngestionConflictError';
  }
}
