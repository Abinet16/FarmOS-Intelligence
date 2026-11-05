import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { AUTH } from '../../modules/auth/auth.module.js';
import type { Auth } from '../../modules/auth/auth.js';
import { IS_PUBLIC } from '../decorators/public.decorator.js';
import type { AppRequest } from '../request.js';

/** Global: every route requires a valid session unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) throw new UnauthorizedException();

    request.auth = {
      user: { id: result.user.id, name: result.user.name, email: result.user.email },
      session: { id: result.session.id, expiresAt: result.session.expiresAt },
    };
    return true;
  }
}
