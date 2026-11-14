import type { Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestId, requestIdOf } from './request-id.middleware.js';

describe('requestId', () => {
  const run = (headers: Record<string, string> = {}) => {
    const req = { headers: { ...headers } } as unknown as Request;
    const setHeader = vi.fn();
    const next = vi.fn();
    requestId(req, { setHeader } as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
    const id = requestIdOf(req);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
    return id;
  };

  it('assigns a fresh id when none is sent', () => {
    const id = run();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(run()).not.toBe(id);
  });

  it('keeps a well-formed id from upstream', () => {
    expect(run({ [REQUEST_ID_HEADER]: 'lb-1234abcd' })).toBe('lb-1234abcd');
  });

  it('replaces ids that are too short, too long or unsafe to log', () => {
    for (const bad of ['short', 'x'.repeat(129), 'abc def ghi', 'line\nbreak-123']) {
      expect(run({ [REQUEST_ID_HEADER]: bad })).not.toBe(bad);
    }
  });
});
