import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canonicalRate } from '@daric/core';
import type {
  CreateExchangeRateInput,
  ExchangeRate,
  ExchangeRateWire,
  UpdateExchangeRateInput,
} from '@daric/core';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../common/db-errors';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { exchangeRates, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: exchangeRates.id,
  currency: exchangeRates.currency,
  rate: exchangeRates.rate,
  effectiveOn: exchangeRates.effectiveOn,
  version: exchangeRates.version,
};

type Row = { [K in keyof typeof columns]: (typeof exchangeRates.$inferSelect)[K] };

export const RATE_TAKEN = 'The currency already has a rate effective on this day';

// Postgres writes `numeric(30, 12)` with all twelve decimals.
function toWire(row: Row): ExchangeRateWire {
  return { ...row, rate: canonicalRate(row.rate) };
}

/** Every rate into `baseCurrency` the Workspace in scope has, for converting totals. */
export async function ratesInto(baseCurrency: string): Promise<ExchangeRate[]> {
  const rows = await scopedTx()
    .select({
      currency: exchangeRates.currency,
      rate: exchangeRates.rate,
      effectiveOn: exchangeRates.effectiveOn,
    })
    .from(exchangeRates)
    .where(eq(exchangeRates.baseCurrency, baseCurrency));
  return rows.map((row) => ({ ...row, rate: canonicalRate(row.rate) }));
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001). Rates into a former Base Currency
// stay stored but are left out of every read and write.
@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async baseCurrency(workspaceId: string): Promise<string> {
    const [workspace] = await scopedTx()
      .select({ baseCurrency: workspaces.baseCurrency })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    return workspace.baseCurrency;
  }

  private async select(workspaceId: string, where?: SQL): Promise<ExchangeRateWire[]> {
    const baseCurrency = await this.baseCurrency(workspaceId);
    const rows = await scopedTx()
      .select(columns)
      .from(exchangeRates)
      .where(and(eq(exchangeRates.baseCurrency, baseCurrency), where))
      .orderBy(asc(exchangeRates.currency), desc(exchangeRates.effectiveOn));
    return rows.map(toWire);
  }

  /** Every rate into the Workspace's current Base Currency, by currency, newest first. */
  async list(membership: Membership): Promise<ExchangeRateWire[]> {
    return this.select(membership.workspaceId);
  }

  private async get(membership: Membership, rateId: string): Promise<ExchangeRateWire> {
    if (!isUuid(rateId)) throw new NotFoundException();
    const [rate] = await this.select(membership.workspaceId, eq(exchangeRates.id, rateId));
    if (!rate) throw new NotFoundException();
    return rate;
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreateExchangeRateInput,
  ): Promise<ExchangeRateWire> {
    const { workspaceId } = membership;
    const baseCurrency = await this.baseCurrency(workspaceId);
    if (input.currency === baseCurrency) {
      throw new BadRequestException('The Base Currency needs no rate');
    }
    const tx = scopedTx();
    const created = one(
      await this.write(() =>
        tx
          .insert(exchangeRates)
          .values({ ...input, workspaceId, baseCurrency })
          .returning({ id: exchangeRates.id }),
      ),
    );
    await this.audit.record(tx, {
      action: 'exchange_rate.create',
      actorUserId: userId,
      workspaceId,
      metadata: { exchangeRateId: created.id },
    });
    return this.get(membership, created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    rateId: string,
    input: UpdateExchangeRateInput,
  ): Promise<ExchangeRateWire> {
    await this.get(membership, rateId);
    const tx = scopedTx();
    await this.write(() =>
      tx
        .update(exchangeRates)
        .set({ ...input, version: sql`${exchangeRates.version} + 1` })
        .where(eq(exchangeRates.id, rateId)),
    );
    await this.audit.record(tx, {
      action: 'exchange_rate.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { exchangeRateId: rateId, fields: Object.keys(input) },
    });
    return this.get(membership, rateId);
  }

  async remove(membership: Membership, userId: string, rateId: string): Promise<void> {
    await this.get(membership, rateId);
    const tx = scopedTx();
    await tx.delete(exchangeRates).where(eq(exchangeRates.id, rateId));
    await this.audit.record(tx, {
      action: 'exchange_rate.delete',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { exchangeRateId: rateId },
    });
  }

  /** Runs a write that may hit the one-rate-per-day rule, answering 409 if it does. */
  private async write<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (isUniqueViolation(error, 'exchange_rates_currency_day_key')) {
        throw new ConflictException(RATE_TAKEN);
      }
      throw error;
    }
  }
}
