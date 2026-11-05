import { createAuthClient } from 'better-auth/react';
import { API_URL } from './config';

/** Session cookies are set by the API; the browser sends them with credentials. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { credentials: 'include' },
});
