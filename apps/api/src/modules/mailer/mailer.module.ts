import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { CONFIG } from '../../common/di-tokens';
import type { Config } from '../../config';
import { MailService } from './mail.service';
import { MAILER, type Mailer } from './mailer';
import { SmtpMailer } from './smtp-mailer';

@Global()
@Module({
  providers: [
    { provide: MAILER, inject: [CONFIG], useFactory: (config: Config) => new SmtpMailer(config) },
    MailService,
  ],
  exports: [MailService],
})
export class MailerModule implements OnApplicationShutdown {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  onApplicationShutdown(): void {
    if (this.mailer instanceof SmtpMailer) this.mailer.close();
  }
}
