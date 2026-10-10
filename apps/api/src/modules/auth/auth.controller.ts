import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { authResultSchema, loginInputSchema, registerInputSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/auth.guard';
import { Client, type ClientInfo } from '../../common/request';
import { ZodBody } from '../../common/zod';
import { AuthService } from './auth.service';

class RegisterDto extends createZodDto(registerInputSchema) {}
class LoginDto extends createZodDto(loginInputSchema) {}
class AuthResultDto extends createZodDto(authResultSchema) {}

@ApiTags('auth')
@Public()
@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  @ApiCreatedResponse({ type: AuthResultDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@ZodBody(RegisterDto) body: RegisterDto, @Client() client: ClientInfo) {
    return this.auth.register(body, client);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse({ description: 'Email or password is incorrect' })
  login(@ZodBody(LoginDto) body: LoginDto, @Client() client: ClientInfo) {
    return this.auth.login(body, client);
  }
}
