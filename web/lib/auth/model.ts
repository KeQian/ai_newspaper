import { z } from 'zod';

export const adminRoleSchema = z.enum(['editor', 'chief_editor', 'admin']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const verifiedOidcIdentitySchema = z.object({
  issuer: z.string().url(),
  subject: z.string().min(1).max(255),
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  emailVerified: z.literal(true),
  authenticatedAt: z.coerce.date(),
  mfaVerifiedAt: z.coerce.date(),
});

export type VerifiedOidcIdentity = z.infer<typeof verifiedOidcIdentitySchema>;

export type AdminSession = {
  adminId: string;
  email: string;
  displayName: string;
  roles: AdminRole[];
  authenticatedAt: Date;
  mfaVerifiedAt: Date;
  expiresAt: Date;
};

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
