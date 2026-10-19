import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExpiryJob } from './expiry-job';
import { ExpiryService } from './expiry.service';

/** What happens as Plus ends: reminders, the Grace Period and the downgrade (ADR-0008). */
@Module({
  imports: [AuthModule],
  providers: [ExpiryService, ExpiryJob],
})
export class ExpiryModule {}
