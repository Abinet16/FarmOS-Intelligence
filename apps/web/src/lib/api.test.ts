import { describe, expect, it } from 'vitest';
import { errorMessage } from './api';

describe('errorMessage', () => {
  it('passes client errors through', () => {
    expect(errorMessage(404, 'Farm not found')).toBe('Farm not found');
    expect(errorMessage(429, 'Too many requests. Try again in 12 s.')).toBe(
      'Too many requests. Try again in 12 s.',
    );
  });

  it('hides server error details behind a short request reference', () => {
    expect(errorMessage(500, 'Internal server error', '3f2a9c1e-0000-4000-8000-000000000000')).toBe(
      'Something went wrong on our side. Please try again (reference 3f2a9c1e).',
    );
    expect(errorMessage(500, 'Internal server error')).toBe(
      'Something went wrong on our side. Please try again.',
    );
  });

  it("keeps the API's own message for deliberate 502 and 503 errors", () => {
    expect(errorMessage(503, 'The assistant is unavailable. Please try again.', 'abc')).toBe(
      'The assistant is unavailable. Please try again.',
    );
  });
});
