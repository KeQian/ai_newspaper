import { createNewsletterServiceFromEnvironment } from '@/lib/newsletter/runtime';

const service = createNewsletterServiceFromEnvironment();
const maximum = Number.parseInt(process.env.NEWSLETTER_BATCH_SIZE ?? '100', 10);
if (!Number.isInteger(maximum) || maximum < 1 || maximum > 500)
  throw new Error('NEWSLETTER_BATCH_SIZE must be an integer from 1 to 500');

let processed = 0;
let failed = 0;
while (processed < maximum) {
  const result = await service.processNext();
  if (!result) break;
  processed += 1;
  if (result.status === 'failed') failed += 1;
}

process.stdout.write(`${JSON.stringify({ processed, failed })}\n`);
if (failed) process.exitCode = 1;
