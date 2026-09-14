import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createAdminNewsletterHandlers } from '@/lib/newsletter/http';
import { createNewsletterServiceFromEnvironment } from '@/lib/newsletter/runtime';

export const dynamic = 'force-dynamic';
const handlers = createAdminNewsletterHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createService: createNewsletterServiceFromEnvironment,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.get(request, (await context.params).id);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.update(request, (await context.params).id);
}
