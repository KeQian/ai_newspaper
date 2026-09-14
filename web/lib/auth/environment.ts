import { z } from 'zod';

const productionAuthEnvironmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://')),
  OIDC_ISSUER_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://')),
  OIDC_CLIENT_ID: z.string().min(1),
  ADMIN_ALLOWED_EMAILS: z.string().min(1),
  ADMIN_SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(15)
    .max(480)
    .default(240),
  ADMIN_RECENT_MFA_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
});

export type ProductionAuthEnvironment = z.infer<
  typeof productionAuthEnvironmentSchema
> & {
  allowedEmails: ReadonlySet<string>;
};

export function parseProductionAuthEnvironment(
  input: unknown,
): ProductionAuthEnvironment {
  const parsed = productionAuthEnvironmentSchema.parse(input);
  const allowedEmails = new Set(
    parsed.ADMIN_ALLOWED_EMAILS.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  if (allowedEmails.size === 0) {
    throw new Error('ADMIN_ALLOWED_EMAILS must contain at least one address');
  }

  for (const email of allowedEmails) {
    z.string().email().parse(email);
  }

  return { ...parsed, allowedEmails };
}
