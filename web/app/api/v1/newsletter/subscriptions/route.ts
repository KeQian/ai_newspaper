import { createPublicNewsletterHandlers } from '@/lib/newsletter/http';
import {
  createNewsletterRateLimiter,
  createNewsletterServiceFromEnvironment,
} from '@/lib/newsletter/runtime';

export const dynamic = 'force-dynamic';
const handlers = createPublicNewsletterHandlers({
  createService: createNewsletterServiceFromEnvironment,
  rateLimiter: createNewsletterRateLimiter(),
});

export function POST(request: Request) {
  return handlers.subscribe(request);
}
