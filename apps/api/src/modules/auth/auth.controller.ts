import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  type AuthResult,
  authResultSchema,
  CLIENT_HEADER,
  CSRF_COOKIE,
  loginInputSchema,
  refreshInputSchema,
  registerInputSchema,
  type Session,
  sessionSchema,
} from '@daric/core';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Public } from './auth.guard';
import { Client, type ClientInfo } from '../../common/request';
import { ZodBody } from '../../common/zod';
import { AuthService, type SignedIn } from './auth.service';
import {
  clearSessionCookies,
  isMobileClient,
  readCookie,
  REFRESH_COOKIE,
  setCsrfCookie,
  setSessionCookies,
} from './cookies';

class RegisterDto extends createZodDto(registerInputSchema) {}
class LoginDto extends createZodDto(loginInputSchema) {}
class RefreshDto extends createZodDto(refreshInputSchema) {}
class SessionDto extends createZodDto(sessionSchema) {}
class AuthResultDto extends createZodDto(authResultSchema) {}

const signedInResponse = {
  description:
    'Web clients get the session and the tokens as httpOnly cookies; ' +
    `clients sending \`${CLIENT_HEADER}: mobile\` get the tokens in the body instead.`,
  schema: { oneOf: [{ $ref: getSchemaPath(SessionDto) }, { $ref: getSchemaPath(AuthResultDto) }] },
};

@ApiTags('auth')
@ApiExtraModels(SessionDto, AuthResultDto)
@ApiHeader({ name: CLIENT_HEADER, required: false, enum: ['mobile'] })
@Public()
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse(signedInResponse)
  @ApiConflictResponse({ description: 'Email is already registered' })
  async register(
    @ZodBody(RegisterDto) body: RegisterDto,
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return deliverSignIn(req, res, await this.auth.register(body, client));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse(signedInResponse)
  @ApiUnauthorizedResponse({ description: 'Email or password is incorrect' })
  async login(
    @ZodBody(LoginDto) body: LoginDto,
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return deliverSignIn(req, res, await this.auth.login(body, client));
  }
}

const refreshBody = {
  type: RefreshDto,
  required: false,
  description: `Only from clients sending \`${CLIENT_HEADER}: mobile\`; the web app's token is in its cookie.`,
};

/**
 * Keeps a Signed-in Device going or ends it. Separate from AuthController so
 * that routine refreshes do not count against the login rate limit; refresh
 * tokens are too long to guess.
 */
@ApiTags('auth')
@ApiExtraModels(SessionDto, AuthResultDto)
@ApiHeader({ name: CLIENT_HEADER, required: false, enum: ['mobile'] })
@Public()
@Controller('v1/auth')
export class SignedInDeviceController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('refresh')
  @HttpCode(200)
  @ApiBody(refreshBody)
  @ApiOkResponse(signedInResponse)
  @ApiUnauthorizedResponse({
    description: 'The refresh token is unknown, used, revoked or expired',
  })
  async refresh(
    @Body() body: unknown,
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = presentedRefreshToken(req, body);
    if (!token) throw new UnauthorizedException();
    return deliverSignIn(req, res, await this.auth.refresh(token, client), { rotateCsrf: false });
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBody(refreshBody)
  @ApiNoContentResponse({ description: 'The Signed-in Device is ended and its cookies cleared' })
  async logout(
    @Body() body: unknown,
    @Client() client: ClientInfo,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = presentedRefreshToken(req, body);
    if (token) await this.auth.logout(token, client);
    if (usesCookies(req)) clearSessionCookies(res);
  }
}

/**
 * Whether the request is judged by its cookies. As in AuthGuard, one carrying
 * `Authorization` or the mobile client header never is, since CsrfGuard lets
 * it through unchecked.
 */
function usesCookies(req: Request): boolean {
  return !isMobileClient(req) && req.get('authorization') === undefined;
}

/** The refresh token from the cookie for the web app, from the body for the mobile app. */
function presentedRefreshToken(req: Request, body: unknown): string | undefined {
  if (usesCookies(req)) return readCookie(req, REFRESH_COOKIE);
  const parsed = refreshInputSchema.safeParse(body);
  return parsed.success ? parsed.data.refreshToken : undefined;
}

/**
 * Hands out the double-submit CSRF cookie. It is a separate controller so that
 * fetching it does not count against the login rate limit.
 */
@ApiTags('auth')
@Public()
@Controller('v1/auth/csrf')
export class CsrfController {
  @Get()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The CSRF cookie is set' })
  issue(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    if (!readCookie(req, CSRF_COOKIE)) setCsrfCookie(res);
  }
}

/** Hands the new tokens to the client: in the body for mobile, as cookies for the web. */
function deliverSignIn(
  req: Request,
  res: Response,
  { user, tokens }: SignedIn,
  { rotateCsrf = true } = {},
): Session | AuthResult {
  const session: Session = {
    user,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
  };
  if (isMobileClient(req)) {
    return { ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
  setSessionCookies(res, tokens);
  // A new session gets a new CSRF token, so one planted before login is useless after it.
  // A refresh keeps the Signed-in Device going, and other open tabs still hold the current token.
  if (rotateCsrf) setCsrfCookie(res);
  return session;
}
