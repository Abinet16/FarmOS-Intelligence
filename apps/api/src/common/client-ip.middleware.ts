import type { NextFunction, Request, Response } from 'express';

/** The only header Better Auth reads for the client's address. */
export const CLIENT_IP_HEADER = 'x-farmos-client-ip';

/**
 * Better Auth keys its rate limits by client IP but only sees request headers.
 * This copies Express's resolved address (which honours `trust proxy`) into a
 * header of our own, overwriting any value the client sent, so the address
 * can't be spoofed and every client gets its own rate-limit bucket.
 */
export function clientIp(req: Request, _res: Response, next: NextFunction) {
  if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
  else delete req.headers[CLIENT_IP_HEADER];
  next();
}
