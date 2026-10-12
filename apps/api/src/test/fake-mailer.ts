import type { Mailer, MailMessage } from '../modules/mailer/mailer';

/** Keeps sent mail in memory so tests can read it; `fail` makes the next sends reject. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  fail = false;

  send(message: MailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error('SMTP is down'));
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Mail sent to `to`, oldest first. */
  to(to: string): MailMessage[] {
    return this.sent.filter((m) => m.to === to);
  }

  /** The newest mail to `to`; throws when there is none. */
  last(to: string): MailMessage {
    const message = this.to(to).at(-1);
    if (!message) throw new Error(`no mail was sent to ${to}`);
    return message;
  }

  /** The token in the newest link to `to` (`?token=…`). */
  lastToken(to: string): string {
    const token = /[?&]token=([\w-]+)/.exec(this.last(to).text)?.[1];
    if (!token) throw new Error(`no token in the last mail to ${to}`);
    return token;
  }
}
