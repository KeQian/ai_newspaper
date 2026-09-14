import { createInternalIngestionHandlers } from '@/lib/ingestion/internal-http';
import { IngestionRunService } from '@/lib/ingestion/run-service';
import {
  createIngestionRepositoryFromEnvironment,
  getIngestionTokenFromEnvironment,
} from '@/lib/ingestion/runtime';

export const dynamic = 'force-dynamic';

const handlers = createInternalIngestionHandlers(
  () => new IngestionRunService(createIngestionRepositoryFromEnvironment()),
  getIngestionTokenFromEnvironment,
);

export async function POST(request: Request): Promise<Response> {
  return handlers.POST(request);
}
