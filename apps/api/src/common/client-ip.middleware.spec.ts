import type { Request, Response } from 'express';
import { CLIENT_IP_HEADER, clientIp } from './client-ip.middleware.js';

describe('clientIp', () => {
  const run = (ip: string | undefined, headers: Record<string, string> = {}) => {
    const req = { ip, headers: { ...headers } } as unknown as Request;
    const next = vi.fn();
    clientIp(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    return req.headers[CLIENT_IP_HEADER];
  };

  it('exposes the resolved client address', () => {
    expect(run('203.0.113.7')).toBe('203.0.113.7');
  });

  it('overwrites a spoofed header', () => {
    expect(run('203.0.113.7', { [CLIENT_IP_HEADER]: '10.0.0.1' })).toBe('203.0.113.7');
    expect(run(undefined, { [CLIENT_IP_HEADER]: '10.0.0.1' })).toBeUndefined();
  });
});
