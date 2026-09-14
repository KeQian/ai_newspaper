import { z } from 'zod';

import { IngestionConflictError, IngestionValidationError } from './model';
import type { IngestionRunService } from './run-service';
import { hasValidIngestionToken } from './token-auth';

export function createInternalIngestionHandlers(
  createService: () => IngestionRunService,
  getExpectedToken: () => string,
  now: () => Date = () => new Date(),
) {
  return {
    async POST(request: Request): Promise<Response> {
      const requestId =
        request.headers.get('x-request-id') ?? crypto.randomUUID();
      let expectedToken: string;
      try {
        expectedToken = getExpectedToken();
      } catch {
        return errorResponse(
          503,
          'INGESTION_UNAVAILABLE',
          'Ingestion is unavailable',
          requestId,
        );
      }
      if (!(await hasValidIngestionToken(request, expectedToken))) {
        return errorResponse(
          401,
          'UNAUTHORIZED',
          'Authentication required',
          requestId,
        );
      }

      const suppliedKey = request.headers.get('idempotency-key');
      if (!suppliedKey) {
        return errorResponse(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'Idempotency-Key is required',
          requestId,
        );
      }

      try {
        const body = await request.json();
        const result = await createService().createOrResume(
          body,
          suppliedKey,
          now(),
        );
        return Response.json(
          {
            id: result.run.id,
            status: result.run.status,
            idempotencyKey: result.run.idempotencyKey,
            reused: result.reused,
            requestId,
          },
          {
            status: 202,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      } catch (error) {
        if (error instanceof IngestionConflictError) {
          return errorResponse(409, 'CONFLICT', error.message, requestId);
        }
        if (
          error instanceof IngestionValidationError ||
          error instanceof z.ZodError ||
          error instanceof SyntaxError
        ) {
          return errorResponse(
            422,
            'VALIDATION_ERROR',
            'Invalid ingestion request',
            requestId,
          );
        }
        return errorResponse(
          503,
          'INGESTION_UNAVAILABLE',
          'Ingestion is unavailable',
          requestId,
        );
      }
    },
  };
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
): Response {
  return Response.json(
    { code, message, requestId },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
