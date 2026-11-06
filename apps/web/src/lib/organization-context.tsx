'use client';

import { hasPermission, type Permission } from '@farmos/shared-types';
import { createContext, useContext } from 'react';
import type { Organization } from './api';

const OrganizationContext = createContext<Organization | null>(null);

export const OrganizationProvider = OrganizationContext.Provider;

/** The organization selected in the URL, loaded by its layout. */
export function useOrganization(): Organization {
  const organization = useContext(OrganizationContext);
  if (!organization) throw new Error('useOrganization must be used under an organization layout');
  return organization;
}

/**
 * Whether to offer an action in the UI. This only hides controls; the API
 * enforces the same permission matrix on every request.
 */
export function useCan(permission: Permission): boolean {
  return hasPermission(useOrganization().role, permission);
}
