import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@daric/core';
import { and, eq, inArray, isNotNull, lte, notExists } from 'drizzle-orm';
import { CONFIG, DATABASE } from '../../common/di-tokens';
import { DAY } from '../../common/time';
import type { Config } from '../../config';
import type { Database, Transaction } from '../../db/client';
import { expirySteps, subscriptions, users, type ExpiryStep } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { SignedInDevicesService } from '../auth/signed-in-devices.service';
import { MailService } from '../mailer/mail.service';
import type { MailMessage } from '../mailer/mailer';
import { gracePeriodTemplate, plusEndingTemplate } from '../mailer/templates';
import { billingConfig, type BillingConfig } from './billing-config';
import { EntitlementsService } from './entitlements.service';
import { dueExpiryStep, REMINDER_DAYS } from './expiry';
import {
  ownersWithSuspendedMembers,
  ownsSharedWorkspace,
  restoreMembersOf,
  suspendMembersOf,
} from './suspension';

/** The web app's checkout page, where every reminder leads. */
const CHECKOUT_PATH = '/settings/subscription/checkout';

/** What one pass did, for the log. */
export interface ExpiryRun {
  mailed: number;
  downgraded: number;
  suspended: number;
  restored: number;
}

/**
 * What happens as a User's Plus time ends (ADR-0008): reminder mails 7 days
 * and 1 day before (there is no auto-renew), a mail when the Grace Period
 * starts, and once it has ended the downgrade: only the most recently used
 * Signed-in Devices stay, and the Members of the User's Workspaces are
 * suspended, never removed. Nothing financial is touched. Each step happens
 * once per expiry (`expiry_steps`), so a renewal starts them afresh. Members
 * are restored as soon as their Owner may share again. Owner connection.
 */
@Injectable()
export class ExpiryService {
  private readonly billing: BillingConfig;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(SignedInDevicesService) private readonly devices: SignedInDevicesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
  ) {
    this.billing = billingConfig(config);
  }

  /**
   * Takes every step due at `now`; `only` limits it to those Users (tests).
   * One User failing does not hold up the others.
   */
  async runDue(now: Date, only?: { userIds: readonly string[] }): Promise<ExpiryRun> {
    const run: ExpiryRun = { mailed: 0, downgraded: 0, suspended: 0, restored: 0 };
    const failures: unknown[] = [];
    const attempt = async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (error) {
        failures.push(error);
      }
    };

    // Nothing ends on a server with billing disabled; suspended Members still come back below.
    if (this.billing.enabled) {
      const firstReminder = new Date(now.getTime() + REMINDER_DAYS.REMINDER_7_DAYS * DAY);
      const ending = await this.db
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(
          and(
            isNotNull(subscriptions.expiresAt),
            lte(subscriptions.expiresAt, firstReminder),
            // Done with once downgraded, until a renewal moves the expiry.
            notExists(
              this.db
                .select({ step: expirySteps.step })
                .from(expirySteps)
                .where(
                  and(
                    eq(expirySteps.userId, subscriptions.userId),
                    eq(expirySteps.expiresAt, subscriptions.expiresAt),
                    eq(expirySteps.step, 'DOWNGRADED'),
                  ),
                ),
            ),
            only && inArray(subscriptions.userId, [...only.userIds]),
          ),
        );
      for (const { userId } of ending) await attempt(() => this.takeDueStep(userId, now, run));
    }

    for (const ownerId of await ownersWithSuspendedMembers(this.db, only?.userIds)) {
      await attempt(async () => {
        if (!(await this.entitlements.entitlementsOf(ownerId, now)).shareWorkspace) return;
        run.restored += await this.db.transaction((tx) =>
          restoreMembersOf(tx, this.audit, ownerId),
        );
      });
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} Users failed`);
    }
    return run;
  }

  /** Takes the User's step due at `now`, if it was not taken for this expiry yet. */
  private async takeDueStep(userId: string, now: Date, run: ExpiryRun): Promise<void> {
    const mail = await this.db.transaction(async (tx) => {
      // Locked, so a Payment settling meanwhile (which locks it too) either
      // moved the expiry already or waits until this step is taken.
      const [subscription] = await tx
        .select({
          expiresAt: subscriptions.expiresAt,
          trialEndsAt: subscriptions.trialEndsAt,
          email: users.email,
          locale: users.locale,
        })
        .from(subscriptions)
        .innerJoin(users, eq(users.id, subscriptions.userId))
        .where(eq(subscriptions.userId, userId))
        .for('update', { of: subscriptions });
      if (!subscription?.expiresAt) return null;
      const { expiresAt } = subscription;
      const step = dueExpiryStep({ expiresAt, now, graceDays: this.billing.graceDays });
      if (!step) return null;
      const [taken] = await tx
        .insert(expirySteps)
        .values({ userId, step, expiresAt, doneAt: now })
        .onConflictDoNothing()
        .returning({ step: expirySteps.step });
      if (!taken) return null;

      if (step === 'DOWNGRADED') {
        await this.downgrade(tx, userId, now, run);
        return null;
      }
      return this.mailFor(tx, step, { userId, ...subscription, expiresAt });
    });
    if (mail) {
      this.mail.deliver(mail);
      run.mailed += 1;
    }
  }

  private async downgrade(tx: Transaction, userId: string, now: Date, run: ExpiryRun) {
    await this.devices.downgrade(tx, userId, now);
    if (!(await this.entitlements.entitlementsOf(userId, now, tx)).shareWorkspace) {
      run.suspended += await suspendMembersOf(tx, this.audit, userId, now);
    }
    run.downgraded += 1;
  }

  private async mailFor(
    tx: Transaction,
    step: Exclude<ExpiryStep, 'DOWNGRADED'>,
    user: {
      userId: string;
      email: string;
      locale: Locale;
      expiresAt: Date;
      trialEndsAt: Date | null;
    },
  ): Promise<MailMessage> {
    const hasMembers = await ownsSharedWorkspace(tx, user.userId);
    const checkoutLink = `${this.config.APP_URL}${CHECKOUT_PATH}`;
    const message =
      step === 'GRACE_STARTED'
        ? gracePeriodTemplate(
            user.locale,
            { days: this.billing.graceDays, hasMembers },
            checkoutLink,
          )
        : plusEndingTemplate(
            user.locale,
            {
              days: REMINDER_DAYS[step],
              onTrial: user.trialEndsAt !== null && user.expiresAt <= user.trialEndsAt,
              graceDays: this.billing.graceDays,
              hasMembers,
            },
            checkoutLink,
          );
    return { to: user.email, ...message };
  }
}
