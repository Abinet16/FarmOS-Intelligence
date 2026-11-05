import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests. SameSite=Lax cookies already
 * stop most cross-site writes; this also rejects any state-changing request that
 * carries cookies but does not come from an allowlisted origin.
 */
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method) || !req.headers.cookie) return next();
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) return next();
    res.status(403).json({ statusCode: 403, message: 'Origin not allowed' });
  };
}
