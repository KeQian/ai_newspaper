import { createPublicContentHandlers } from '@/lib/public-content/http';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

const handlers = createPublicContentHandlers(
  createPublicContentServiceFromEnvironment,
);

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return handlers.topic(request, (await context.params).slug);
}
