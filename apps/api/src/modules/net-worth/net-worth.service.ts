import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { accountValue, amountToWire, currencyByCode, money, netWorth, todayIn } from '@daric/core';
import type { NetWorthWire } from '@daric/core';
import { eq } from 'drizzle-orm';
import type { Membership } from '../../common/request';
import { workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AccountsService } from '../accounts/accounts.service';
import { ratesInto } from '../exchange-rates/exchange-rates.service';
import { allValuations } from '../valuations/valuations.service';

@Injectable()
export class NetWorthService {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  /**
   * Net Worth today in the Workspace's timezone: every Account, archived ones
   * included, at its latest Valuation on or before today, else its balance.
   */
  async get(membership: Membership): Promise<NetWorthWire> {
    const [workspace] = await scopedTx()
      .select({ baseCurrency: workspaces.baseCurrency, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    const day = todayIn(new Date(), workspace.timezone);
    const base = currencyByCode(workspace.baseCurrency);
    const accounts = await this.accounts.list({ includeArchived: true });
    const valuations = await allValuations();
    const rates = await ratesInto(base.code);

    const valued = accounts.map((account) => {
      const currency = currencyByCode(account.currency);
      const balance = money(BigInt(account.balance), currency);
      const own = valuations.filter((v) => v.accountId === account.id);
      return { account, ...accountValue(balance, own, day) };
    });
    const result = netWorth(
      valued.map(({ account, value }) => ({ id: account.id, class: account.class, value })),
      base,
      rates,
      day,
    );
    return {
      day,
      baseCurrency: base.code,
      total: amountToWire(result.total.amount),
      assets: amountToWire(result.assets.amount),
      liabilities: amountToWire(result.liabilities.amount),
      byCurrency: result.byCurrency.map((c) => ({
        currency: c.currency.code,
        assets: amountToWire(c.assets.amount),
        liabilities: amountToWire(c.liabilities.amount),
        net: amountToWire(c.net.amount),
      })),
      accounts: valued.map(({ account, value, valuedOn }, index) => {
        const inBase = result.accounts[index]?.inBase;
        return {
          accountId: account.id,
          name: account.name,
          class: account.class,
          currency: account.currency,
          archived: account.archived,
          value: amountToWire(value.amount),
          valuedOn,
          inBase: inBase ? amountToWire(inBase.amount) : null,
        };
      }),
      ratesUsed: result.ratesUsed,
      missing: result.missing.map((c) => c.code),
    };
  }
}
