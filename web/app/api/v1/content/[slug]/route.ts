import { createPublicContentHandlers } from '@/lib/public-content/http';
import { createPublicContentServiceFromEnvironment } from '@/lib/public-content/runtime';

export const dynamic = 'force-dynamic';
const handlers = createPublicContentHandlers(
  createPublicContentServiceFromEnvironment,
);

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return handlers.get(request, (await context.params).slug);
}
