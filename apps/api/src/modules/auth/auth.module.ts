import { Module } from '@nestjs/common';
import {
  AuthController,
  CsrfController,
  EmailVerificationController,
  SignedInDeviceController,
} from './auth.controller';
import { AuthService } from './auth.service';
import { EmailLinksService } from './email-links.service';
import { EmailTokenService } from './email-token.service';
import { TokenService } from './token.service';

@Module({
  controllers: [
    AuthController,
    SignedInDeviceController,
    CsrfController,
    EmailVerificationController,
  ],
  providers: [AuthService, TokenService, EmailTokenService, EmailLinksService],
  exports: [TokenService],
})
export class AuthModule {}
