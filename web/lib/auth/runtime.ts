import { createDatabase } from '@/db/client';

import { DrizzleAdminSessionRepository } from './drizzle-session-repository';
import { parseProductionAuthEnvironment } from './environment';
import { AdminSessionService } from './session-service';

export function createAdminSessionServiceFromEnvironment(): AdminSessionService {
  const environment = parseProductionAuthEnvironment(process.env);
  return new AdminSessionService(
    new DrizzleAdminSessionRepository(createDatabase(environment.DATABASE_URL)),
    {
      allowedEmails: environment.allowedEmails,
      sessionTtlMinutes: environment.ADMIN_SESSION_TTL_MINUTES,
    },
  );
}
