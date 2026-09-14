import { evaluateOperationsAlerts } from './alerts';
import type { OperationsRepository, OperationsSnapshot } from './types';
import { hasValidIngestionToken } from '@/lib/ingestion/token-auth';

const noStore = { 'Cache-Control': 'no-store' };

export function livenessResponse(request: Request) {
  return Response.json(
    {
      status: 'ok',
      requestId: request.headers.get('x-request-id') ?? crypto.randomUUID(),
    },
    { headers: noStore },
  );
}

export function createOperationsStatusHandler(input: {
  getExpectedToken: () => string;
  createRepository: () => OperationsRepository;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return async function GET(request: Request): Promise<Response> {
    const requestId =
      request.headers.get('x-request-id') ?? crypto.randomUUID();
    let token: string;
    try {
      token = input.getExpectedToken();
    } catch {
      return error(503, 'OPERATIONS_UNAVAILABLE', requestId);
    }
    if (!(await hasValidIngestionToken(request, token))) {
      return error(401, 'UNAUTHORIZED', requestId);
    }
    try {
      const snapshot = await input.createRepository().snapshot(now());
      return Response.json(
        {
          ...serialize(snapshot),
          alerts: evaluateOperationsAlerts(snapshot),
          requestId,
        },
        { headers: noStore },
      );
    } catch {
      return error(503, 'DATABASE_UNAVAILABLE', requestId);
    }
  };
}

function serialize(snapshot: OperationsSnapshot) {
  return {
    ...snapshot,
    checkedAt: snapshot.checkedAt.toISOString(),
    outbox: {
      ...snapshot.outbox,
      oldestAvailableAt:
        snapshot.outbox.oldestAvailableAt?.toISOString() ?? null,
    },
  };
}

function error(status: number, code: string, requestId: string) {
  return Response.json(
    {
      code,
      message:
        status === 401
          ? 'Authentication required'
          : 'Operations status is unavailable',
      requestId,
    },
    { status, headers: noStore },
  );
}
