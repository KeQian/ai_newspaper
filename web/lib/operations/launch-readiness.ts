import { z } from 'zod';

export const requiredLaunchEnvironmentKeys = [
  'NODE_ENV',
  'DATABASE_URL',
  'PUBLIC_SITE_URL',
  'PUBLIC_CONTACT_EMAIL',
  'OIDC_ISSUER_URL',
  'OIDC_CLIENT_ID',
  'ADMIN_ALLOWED_EMAILS',
  'INGESTION_TOKEN',
  'OPERATIONS_TOKEN',
  'RAW_ARCHIVE_DIR',
  'CANDIDATE_RESPONSE_DIR',
  'NEWSLETTER_PUBLIC_URL',
  'NEWSLETTER_TOKEN_SECRET',
  'NEWSLETTER_FROM',
  'EMAIL_API_URL',
  'EMAIL_API_TOKEN',
  'EMAIL_PROVIDER_KEY',
  'EMAIL_WEBHOOK_SECRET',
  'LAUNCH_REGION_APPROVED',
  'LAUNCH_BRAND_APPROVED',
  'LAUNCH_LEGAL_APPROVED',
  'LAUNCH_OIDC_TESTED',
  'LAUNCH_EMAIL_DOMAIN_VERIFIED',
  'LAUNCH_BACKUP_RESTORE_TESTED_AT',
  'LAUNCH_ALERTS_TESTED_AT',
] as const;

const environmentSchema = z.object({
  NODE_ENV: z.literal('production'),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  PUBLIC_SITE_URL: z.string().url().startsWith('https://'),
  PUBLIC_CONTACT_EMAIL: z.string().email(),
  OIDC_ISSUER_URL: z.string().url().startsWith('https://'),
  OIDC_CLIENT_ID: z.string().min(1),
  ADMIN_ALLOWED_EMAILS: z.string().min(3),
  INGESTION_TOKEN: z.string().min(32),
  OPERATIONS_TOKEN: z.string().min(32),
  RAW_ARCHIVE_DIR: z.string().startsWith('/'),
  CANDIDATE_RESPONSE_DIR: z.string().startsWith('/'),
  NEWSLETTER_PUBLIC_URL: z.string().url().startsWith('https://'),
  NEWSLETTER_TOKEN_SECRET: z.string().min(32),
  NEWSLETTER_FROM: z.string().min(3),
  EMAIL_API_URL: z.string().url().startsWith('https://'),
  EMAIL_API_TOKEN: z.string().min(16),
  EMAIL_PROVIDER_KEY: z.string().min(1),
  EMAIL_WEBHOOK_SECRET: z.string().min(32),
  ENABLE_DEV_AUTH: z.enum(['false', '0']).optional(),
  LAUNCH_REGION_APPROVED: z.literal('true'),
  LAUNCH_BRAND_APPROVED: z.literal('true'),
  LAUNCH_LEGAL_APPROVED: z.literal('true'),
  LAUNCH_OIDC_TESTED: z.literal('true'),
  LAUNCH_EMAIL_DOMAIN_VERIFIED: z.literal('true'),
  LAUNCH_BACKUP_RESTORE_TESTED_AT: z.string().datetime({ offset: true }),
  LAUNCH_ALERTS_TESTED_AT: z.string().datetime({ offset: true }),
});

export type LaunchCheckResult = {
  ready: boolean;
  blockers: string[];
};

export function checkLaunchReadiness(
  input: Record<string, string | undefined>,
  now = new Date(),
): LaunchCheckResult {
  const parsed = environmentSchema.safeParse(input);
  const blockers = parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `ENV_${issue.path.join('_').toUpperCase()}`,
      );

  if (containsPlaceholder(input.PUBLIC_SITE_URL))
    blockers.push('PUBLIC_SITE_URL_PLACEHOLDER');
  if (containsPlaceholder(input.PUBLIC_CONTACT_EMAIL))
    blockers.push('PUBLIC_CONTACT_EMAIL_PLACEHOLDER');
  if (containsPlaceholder(input.OIDC_ISSUER_URL))
    blockers.push('OIDC_ISSUER_PLACEHOLDER');
  if (input.NEWSLETTER_PUBLIC_URL !== input.PUBLIC_SITE_URL)
    blockers.push('NEWSLETTER_PUBLIC_URL_MISMATCH');

  const secrets = [
    input.INGESTION_TOKEN,
    input.OPERATIONS_TOKEN,
    input.NEWSLETTER_TOKEN_SECRET,
    input.EMAIL_WEBHOOK_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (new Set(secrets).size !== secrets.length)
    blockers.push('SECRETS_MUST_BE_DISTINCT');

  checkRecent(
    input.LAUNCH_BACKUP_RESTORE_TESTED_AT,
    now,
    31,
    'BACKUP_RESTORE_DRILL_STALE',
    blockers,
  );
  checkRecent(
    input.LAUNCH_ALERTS_TESTED_AT,
    now,
    7,
    'ALERT_DRILL_STALE',
    blockers,
  );
  return {
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)].sort(),
  };
}

function containsPlaceholder(value: string | undefined) {
  return !value || /example\.(?:com|test)|replace-with/iu.test(value);
}

function checkRecent(
  value: string | undefined,
  now: Date,
  maximumDays: number,
  code: string,
  blockers: string[],
) {
  if (!value) return;
  const date = new Date(value);
  const age = now.getTime() - date.getTime();
  if (Number.isNaN(age) || age < 0 || age > maximumDays * 24 * 60 * 60_000)
    blockers.push(code);
}
