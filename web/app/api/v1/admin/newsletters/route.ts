import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createAdminNewsletterHandlers } from '@/lib/newsletter/http';
import { createNewsletterServiceFromEnvironment } from '@/lib/newsletter/runtime';

export const dynamic = 'force-dynamic';
const handlers = createAdminNewsletterHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createService: createNewsletterServiceFromEnvironment,
});

export function GET(request: Request) {
  return handlers.list(request);
}

export function POST(request: Request) {
  return handlers.create(request);
}
