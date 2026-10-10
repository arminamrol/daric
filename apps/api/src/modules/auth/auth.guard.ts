import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppRequest } from '../../common/request';
import { ACCESS_COOKIE, isMobileClient, readCookie } from './cookies';
import { TokenService } from './token.service';

const IS_PUBLIC = 'daric:public';
/** Marks a route as reachable without an access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Global guard: every route needs a valid access token unless @Public, from
 * `Authorization: Bearer` (mobile) or the access cookie (web). A request that
 * sends a bearer header is judged by it alone, and one that says it is the
 * mobile app never by cookies: CsrfGuard lets such requests through unchecked.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const token =
      bearerToken(req) ?? (isMobileClient(req) ? undefined : readCookie(req, ACCESS_COOKIE));
    if (!token) throw new UnauthorizedException();
    const userId = await this.tokens.verifyAccessToken(token);
    if (!userId) throw new UnauthorizedException();
    req.user = { id: userId };
    return true;
  }
}

function bearerToken(req: AppRequest): string | undefined {
  const header = req.get('authorization');
  if (header === undefined) return undefined;
  const [scheme, token] = header.split(' ');
  // A malformed header is not silently replaced by the cookie.
  return scheme?.toLowerCase() === 'bearer' && token ? token : '';
}
