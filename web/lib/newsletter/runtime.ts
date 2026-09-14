import { createDatabase } from '@/db/client';
import { PostgresSearchRateLimiter } from '@/lib/search/rate-limit';

import { DrizzleNewsletterRepository } from './drizzle-repository';
import { DisabledEmailAdapter, HttpEmailAdapter } from './email-adapter';
import { NewsletterService } from './service';

export function createNewsletterServiceFromEnvironment() {
  const databaseUrl = required('DATABASE_URL');
  const endpoint = process.env.EMAIL_API_URL;
  const token = process.env.EMAIL_API_TOKEN;
  const from = process.env.NEWSLETTER_FROM;
  const email =
    endpoint && token && from
      ? new HttpEmailAdapter(endpoint, token, from)
      : new DisabledEmailAdapter();
  return new NewsletterService(
    new DrizzleNewsletterRepository(createDatabase(databaseUrl)),
    email,
    {
      publicUrl: required('NEWSLETTER_PUBLIC_URL').replace(/\/$/u, ''),
      tokenSecret: required('NEWSLETTER_TOKEN_SECRET'),
    },
  );
}

export function createNewsletterRateLimiter() {
  return new PostgresSearchRateLimiter(
    createDatabase(required('DATABASE_URL')),
    10,
    60 * 60_000,
    'newsletter-subscribe',
  );
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
