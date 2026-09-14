import { createAdminSessionServiceFromEnvironment } from '@/lib/auth/runtime';
import { createAdminIngestionHandlers } from '@/lib/ingestion/admin-http';
import { createIngestionRepositoryFromEnvironment } from '@/lib/ingestion/runtime';
import { SourceRegistryService } from '@/lib/ingestion/source-service';

export const dynamic = 'force-dynamic';

const handlers = createAdminIngestionHandlers({
  createSessionService: createAdminSessionServiceFromEnvironment,
  createSourceService: () =>
    new SourceRegistryService(createIngestionRepositoryFromEnvironment()),
  createRunRepository: createIngestionRepositoryFromEnvironment,
});

export async function GET(request: Request): Promise<Response> {
  return handlers.listSources(request);
}
