import { AuthenticationError, verifiedOidcIdentitySchema } from './model';

export function createDevelopmentIdentity(
  input: unknown,
  environment: { NODE_ENV?: string; ENABLE_DEV_AUTH?: string },
) {
  if (
    environment.NODE_ENV === 'production' ||
    environment.ENABLE_DEV_AUTH !== 'true'
  ) {
    throw new AuthenticationError('Development authentication is disabled');
  }

  return verifiedOidcIdentitySchema.parse(input);
}
