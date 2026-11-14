import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** What we accept from a caller or proxy: short, and safe to put in a log line. */
const ACCEPTED = /^[\w.:-]{8,128}$/;

/**
 * Gives every request an id, echoed in the `X-Request-Id` response header and
 * attached to its log lines. A well-formed id from a proxy or the caller is
 * kept, so one id follows a request across services; anything else is replaced.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && ACCEPTED.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/** The id `requestId` assigned, for logs and error reports. */
export function requestIdOf(req: Request): string | undefined {
  const id = req.headers[REQUEST_ID_HEADER];
  return typeof id === 'string' ? id : undefined;
}
