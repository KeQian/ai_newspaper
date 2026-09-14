import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createEditorialCandidateHandlers } from '@/lib/editorial/candidates/http';
import { createEditorialCandidateServiceFromEnvironment } from '@/lib/editorial/candidates/runtime';

export const dynamic = 'force-dynamic';

// Keep the route adapter transport-only; authorization remains in the handler.
const handlers = createEditorialCandidateHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createCandidateService: createEditorialCandidateServiceFromEnvironment,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.get(request, (await context.params).id);
}
