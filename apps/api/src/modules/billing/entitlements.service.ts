import { Inject, Injectable } from '@nestjs/common';
import type { Entitlements, Subscription } from '@daric/core';
import { eq } from 'drizzle-orm';
import { CONFIG, DATABASE } from '../../common/di-tokens';
import type { Config } from '../../config';
import { billingConfig, type BillingConfig } from './billing-config';
import type { Database, Executor } from '../../db/client';
import { subscriptions } from '../../db/schema';
import { subscriptionView, trialFor } from './entitlements';

/**
 * Answers what a User may do: Signed-in Devices, sharing a Workspace, AI
 * analyses left this month (ADR-0008). Every check on the server goes
 * through here; clients only read the answer. Subscriptions belong to the
 * User, so this runs on the owner connection, never Workspace-scoped.
 */
@Injectable()
export class EntitlementsService {
  private readonly billing: BillingConfig;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) config: Config,
  ) {
    this.billing = billingConfig(config);
  }

  /** Gives a new User their Trial; called in the registration transaction. */
  async startTrial(tx: Executor, userId: string, now = new Date()): Promise<void> {
    await tx.insert(subscriptions).values({ userId, ...trialFor(now, this.billing.trialDays) });
  }

  /** `db` lets a check read inside the caller's transaction. */
  async subscriptionOf(
    userId: string,
    now = new Date(),
    db: Executor = this.db,
  ): Promise<Subscription> {
    const [stored] = await db
      .select({
        plan: subscriptions.plan,
        trialEndsAt: subscriptions.trialEndsAt,
        expiresAt: subscriptions.expiresAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId));
    // AI analyses are not counted until AI exists (40.5).
    return subscriptionView(stored, { now, billing: this.billing, aiAnalysesUsedThisMonth: 0 });
  }

  async entitlementsOf(
    userId: string,
    now = new Date(),
    db: Executor = this.db,
  ): Promise<Entitlements> {
    return (await this.subscriptionOf(userId, now, db)).entitlements;
  }
}
