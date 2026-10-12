import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAILER, type Mailer, type MailMessage } from './mailer';

/**
 * Hands mail to the Mailer without waiting for it. A slow or failing mail
 * server must not slow down or fail the request, and response times must not
 * reveal whether a mail went out (e.g. which emails are registered).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  deliver(message: MailMessage): void {
    this.mailer.send(message).catch((error: unknown) => {
      // Never the message itself: the body holds a token.
      this.logger.error(error, `Sending mail "${message.subject}" failed`);
    });
  }
}
