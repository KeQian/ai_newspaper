import type { VerifiedOidcIdentity } from './model';

export type OidcAuthorizationRequest = {
  returnTo: string;
  state: string;
  nonce: string;
};

export interface OidcIdentityProvider {
  createAuthorizationUrl(request: OidcAuthorizationRequest): Promise<URL>;
  verifyCallback(request: Request): Promise<VerifiedOidcIdentity>;
}
