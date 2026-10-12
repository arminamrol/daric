import nodemailer, { type Transporter } from 'nodemailer';
import type { Config } from '../../config';
import type { Mailer, MailMessage } from './mailer';

/** Sends through the SMTP server in the config (Mailpit in development). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(config: Config) {
    this.transport = nodemailer.createTransport(
      {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        ...(config.SMTP_USER && {
          auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' },
        }),
      },
      { from: config.MAIL_FROM },
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail(message);
  }

  close(): void {
    this.transport.close();
  }
}
