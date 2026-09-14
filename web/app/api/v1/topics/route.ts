import { createPublicContentHandlers } from '@/lib/public-content/http';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

const handlers = createPublicContentHandlers(
  createPublicContentServiceFromEnvironment,
);

export function GET(request: Request) {
  return handlers.topics(request);
}
