import { clearAdminSessionCookie, readAdminSessionToken } from './cookie';
import { requireSameOrigin } from './csrf';
import { AuthenticationError, AuthorizationError } from './model';
import type { AdminSessionService } from './session-service';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

export function createAdminSessionHandlers(
  createService: () => AdminSessionService,
  now: () => Date = () => new Date(),
) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const session = await createService().getSession(
          readAdminSessionToken(request),
          now(),
        );
        return Response.json(
          {
            adminId: session.adminId,
            email: session.email,
            displayName: session.displayName,
            roles: session.roles,
            expiresAt: session.expiresAt.toISOString(),
          },
          { headers: privateHeaders },
        );
      } catch (error) {
        return authErrorResponse(error, request);
      }
    },

    async DELETE(request: Request): Promise<Response> {
      try {
        requireSameOrigin(request);
        const service = createService();
        const token = readAdminSessionToken(request);
        await service.getSession(token, now());
        await service.endSession(token, now());

        return new Response(null, {
          status: 204,
          headers: {
            ...privateHeaders,
            'Set-Cookie': clearAdminSessionCookie(),
          },
        });
      } catch (error) {
        return authErrorResponse(error, request);
      }
    },
  };
}

function authErrorResponse(error: unknown, request: Request): Response {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError
  ) {
    return Response.json(
      {
        code: error.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
        message:
          error.status === 401
            ? 'Authentication required'
            : 'Permission denied',
        requestId,
      },
      { status: error.status, headers: privateHeaders },
    );
  }

  return Response.json(
    {
      code: 'AUTH_CONFIGURATION_ERROR',
      message: 'Authentication is unavailable',
      requestId,
    },
    { status: 503, headers: privateHeaders },
  );
}
