import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ResetPasswordInput } from '@daric/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { ClientInfo } from '../../common/request';
import { CONFIG, DATABASE } from '../../common/di-tokens';
import type { Config } from '../../config';
import { type Database, type Executor, one, type Transaction } from '../../db/client';
import { authIdentities, users } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mailer/mail.service';
import type { MailMessage } from '../mailer/mailer';
import {
  passwordChangedTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from '../mailer/templates';
import { EMAIL_TOKEN_TTL_HOURS, EmailTokenService } from './email-token.service';
import { hashPassword } from './passwords';
import { TokenService } from './token.service';

interface Recipient {
  id: string;
  email: string;
}

const invalidLink = () => new BadRequestException('The link is invalid, used or expired');

/**
 * Email verification and password reset: both mail the User a single-use
 * link to the web app and act when its token comes back. Mail goes out only
 * after the transaction that stored its token commits.
 */
@Injectable()
export class EmailLinksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(EmailTokenService) private readonly emailTokens: EmailTokenService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /**
   * The verification mail for a new User, issued inside the registration
   * transaction; the caller delivers it once that commits.
   */
  async verificationMail(tx: Transaction, user: Recipient): Promise<MailMessage | null> {
    const token = await this.emailTokens.issue(tx, user, 'VERIFY_EMAIL');
    if (!token) return null;
    const link = this.link('/verify-email', token);
    return { to: user.email, ...verifyEmailTemplate(link, EMAIL_TOKEN_TTL_HOURS.VERIFY_EMAIL) };
  }

  deliver(message: MailMessage | null): void {
    if (message) this.mail.deliver(message);
  }

  /** Mails a new verification link to a signed-in User, voiding the earlier one. */
  async resendVerification(userId: string): Promise<void> {
    const message = await this.db.transaction(async (tx) => {
      const user = one(
        await tx
          .select({ id: users.id, email: users.email, verifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, userId))
          .for('update'),
      );
      if (user.verifiedAt) throw new ConflictException('Email is already verified');
      const mail = await this.verificationMail(tx, user);
      if (!mail) {
        throw new HttpException('Too many verification mails', HttpStatus.TOO_MANY_REQUESTS);
      }
      return mail;
    });
    this.deliver(message);
  }

  async verify(token: string, client: ClientInfo): Promise<void> {
    await this.db.transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, token, 'VERIFY_EMAIL');
      if (!userId) throw invalidLink();
      await markVerified(tx, userId);
      await this.audit.record(tx, { action: 'auth.email_verified', actorUserId: userId, client });
    });
  }

  /**
   * Mails a reset link if the email belongs to a User. The answer is the same
   * either way, so it does not reveal who is registered.
   */
  async forgotPassword(email: string, client: ClientInfo): Promise<void> {
    const message = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, email: users.email })
        .from(authIdentities)
        .innerJoin(users, eq(users.id, authIdentities.userId))
        .where(and(eq(authIdentities.provider, 'PASSWORD'), eq(authIdentities.identifier, email)));
      if (!user) return null;
      const token = await this.emailTokens.issue(tx, user, 'RESET_PASSWORD');
      if (!token) return null;
      await this.audit.record(tx, {
        action: 'auth.password_reset_requested',
        actorUserId: user.id,
        client,
      });
      const link = this.link('/reset-password', token);
      return {
        to: user.email,
        ...resetPasswordTemplate(link, EMAIL_TOKEN_TTL_HOURS.RESET_PASSWORD),
      };
    });
    this.deliver(message);
  }

  /**
   * Sets a new password from a reset link and ends every Signed-in Device of
   * the User, since whoever knew the old password may hold one of them.
   */
  async resetPassword(input: ResetPasswordInput, client: ClientInfo): Promise<void> {
    const secretHash = await hashPassword(input.password);
    const message = await this.db.transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, input.token, 'RESET_PASSWORD');
      if (!userId) throw invalidLink();
      await tx
        .update(authIdentities)
        .set({ secretHash })
        .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, 'PASSWORD')));
      // Following a link mailed to the address proves the User reads it.
      const user = await markVerified(tx, userId);
      await this.tokens.revokeAllForUser(tx, userId);
      await this.emailTokens.voidOutstanding(tx, userId, 'RESET_PASSWORD');
      await this.audit.record(tx, { action: 'auth.password_reset', actorUserId: userId, client });
      return { to: user.email, ...passwordChangedTemplate(this.link('/forgot-password')) };
    });
    this.deliver(message);
  }

  private link(path: string, token?: string): string {
    const url = new URL(path, `${this.config.APP_URL}/`);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }
}

/** Marks the User's email verified unless it already is; returns the User. */
async function markVerified(db: Executor, userId: string): Promise<Recipient> {
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  return one(
    await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)),
  );
}
