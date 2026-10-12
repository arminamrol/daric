/** One email to one recipient, with a plain-text and an HTML body. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends email. SMTP in production and development (Mailpit); a fake in tests. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Releases connections on shutdown. */
  close?(): void;
}

export const MAILER = Symbol('MAILER');
