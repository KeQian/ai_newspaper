import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createEditorialCandidateHandlers } from '@/lib/editorial/candidates/http';
import { createEditorialCandidateServiceFromEnvironment } from '@/lib/editorial/candidates/runtime';

export const dynamic = 'force-dynamic';

const handlers = createEditorialCandidateHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createCandidateService: createEditorialCandidateServiceFromEnvironment,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handlers.decide(request, (await context.params).id);
}
