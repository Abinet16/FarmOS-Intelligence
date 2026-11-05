import type { Request } from 'express';
import type { Role } from '@farmos/shared-types';

export interface AuthContext {
  user: { id: string; name: string; email: string };
  session: { id: string; expiresAt: Date };
}

/** Resolved by TenantGuard from the :organizationId route parameter. */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: Role;
}

export interface AppRequest extends Request {
  auth?: AuthContext;
  tenant?: TenantContext;
}
