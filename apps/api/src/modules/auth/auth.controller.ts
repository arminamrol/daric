import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
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
import { isMobileClient, readCookie, setCsrfCookie, setSessionCookies } from './cookies';

class RegisterDto extends createZodDto(registerInputSchema) {}
class LoginDto extends createZodDto(loginInputSchema) {}
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
  setCsrfCookie(res);
  return session;
}
