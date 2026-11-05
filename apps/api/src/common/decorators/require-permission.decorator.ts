import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@farmos/shared-types';

export const REQUIRED_PERMISSIONS = 'farmos:requiredPermissions';

/**
 * Requires the caller's membership in the route's organization to grant every
 * listed permission. Only valid on routes with an :organizationId parameter.
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
