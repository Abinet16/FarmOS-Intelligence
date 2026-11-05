import type { Role } from '@farmos/shared-types';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON fetch against the versioned API, sending the session cookie. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const issues = Array.isArray(body.issues)
      ? body.issues
          .map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
          .join('; ')
      : null;
    throw new ApiError(response.status, issues ?? body.message ?? response.statusText);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  role: Role;
}
