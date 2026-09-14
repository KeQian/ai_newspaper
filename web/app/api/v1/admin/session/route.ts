import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createAdminSessionHandlers } from '@/lib/auth/session-http';

export const dynamic = 'force-dynamic';

const handlers = createAdminSessionHandlers(
  createAdminSessionServiceFromEnvironment,
);

export async function GET(request: Request): Promise<Response> {
  return handlers.GET(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handlers.DELETE(request);
}
