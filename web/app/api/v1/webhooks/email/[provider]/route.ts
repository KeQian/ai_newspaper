import { createNewsletterServiceFromEnvironment } from '@/lib/newsletter/runtime';
import { createEmailWebhookHandler } from '@/lib/newsletter/webhook';

export const dynamic = 'force-dynamic';
const handler = createEmailWebhookHandler({
  createService: createNewsletterServiceFromEnvironment,
  secret: process.env.EMAIL_WEBHOOK_SECRET ?? '',
  provider: process.env.EMAIL_PROVIDER_KEY ?? 'generic',
});

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return handler(request, (await context.params).provider);
}
