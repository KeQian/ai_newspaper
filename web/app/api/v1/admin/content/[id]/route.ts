import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createContentHandlers } from '@/lib/content/http';
import { createContentServiceFromEnvironment } from '@/lib/content/runtime';

export const dynamic = 'force-dynamic';
const handlers = createContentHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createContentService: createContentServiceFromEnvironment,
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
