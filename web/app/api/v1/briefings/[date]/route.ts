import { createPublicContentHandlers } from '@/lib/public-content/http';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

const handlers = createPublicContentHandlers(
  createPublicContentServiceFromEnvironment,
);

export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  return handlers.briefing(request, (await context.params).date);
}
