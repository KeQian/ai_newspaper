import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createAdminNewsletterHandlers } from '@/lib/newsletter/http';
import { createNewsletterServiceFromEnvironment } from '@/lib/newsletter/runtime';

export const dynamic = 'force-dynamic';
const handlers = createAdminNewsletterHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createService: createNewsletterServiceFromEnvironment,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.send(request, (await context.params).id);
}
