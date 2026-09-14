import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createContentHandlers } from '@/lib/content/http';
import { createContentServiceFromEnvironment } from '@/lib/content/runtime';

export const dynamic = 'force-dynamic';
const handlers = createContentHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createContentService: createContentServiceFromEnvironment,
});
export function GET(request: Request) {
  return handlers.list(request);
}

export function POST(request: Request) {
  return handlers.create(request);
}
