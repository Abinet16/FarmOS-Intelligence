/**
 * Organization-scoped roles. A user's role is stored per membership, so the
 * same person can be a manager in one organization and an auditor in another.
 */
export const ROLES = [
  'OWNER',
  'MANAGER',
  'SUPERVISOR',
  'FIELD_WORKER',
  'VETERINARIAN',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Fine-grained permissions. Code checks permissions, never role names, so the
 * matrix below is the single place that decides who can do what.
 */
export const PERMISSIONS = [
  'organization:manage',
  'access:manage',
  'farm:configure',
  'production:record',
  'production:approve-correction',
  'health:record',
  'reports:view',
  'reports:view-limited',
  'audit:view',
  'ai:query',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    'organization:manage',
    'access:manage',
    'farm:configure',
    'production:record',
    'production:approve-correction',
    'health:record',
    'reports:view',
    'audit:view',
    'ai:query',
  ],
  MANAGER: [
    'farm:configure',
    'production:record',
    'production:approve-correction',
    'health:record',
    'reports:view',
    'audit:view',
    'ai:query',
  ],
  SUPERVISOR: [
    'production:record',
    'production:approve-correction',
    'health:record',
    'reports:view',
    'ai:query',
  ],
  FIELD_WORKER: ['production:record', 'reports:view-limited'],
  VETERINARIAN: ['health:record', 'reports:view', 'ai:query'],
  AUDITOR: ['reports:view', 'audit:view'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
