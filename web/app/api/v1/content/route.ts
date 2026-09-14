import { createPublicContentHandlers } from '@/lib/public-content/http';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

export const dynamic = 'force-dynamic';
const handlers = createPublicContentHandlers(
  createPublicContentServiceFromEnvironment,
);

export function GET(request: Request) {
  return handlers.list(request);
}
