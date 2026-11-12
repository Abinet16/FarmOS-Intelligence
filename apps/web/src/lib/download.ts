import { ApiError } from './api';
import { API_URL } from './config';

/** The file name from a Content-Disposition header, or the fallback. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

/**
 * Downloads a file from the API with the session cookie. A plain link can't
 * be used: the API is on another origin, so the browser wouldn't send the
 * cookie with a navigation, and errors would replace the page.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/v1${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const issues = Array.isArray(body.issues)
      ? body.issues.map((i: { message: string }) => i.message).join('; ')
      : null;
    throw new ApiError(response.status, issues ?? body.message ?? response.statusText);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFromDisposition(
    response.headers.get('content-disposition'),
    fallbackName,
  );
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
