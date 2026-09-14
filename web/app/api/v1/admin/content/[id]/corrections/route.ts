import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createContentHandlers } from '@/lib/content/http';
import { createContentServiceFromEnvironment } from '@/lib/content/runtime';

const handlers = createContentHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createContentService: createContentServiceFromEnvironment,
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.correct(request, (await context.params).id);
}
