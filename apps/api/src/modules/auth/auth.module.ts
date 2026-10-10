import { Module } from '@nestjs/common';
import { AuthController, CsrfController, SignedInDeviceController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController, SignedInDeviceController, CsrfController],
  providers: [AuthService, TokenService],
  exports: [TokenService],
})
export class AuthModule {}
