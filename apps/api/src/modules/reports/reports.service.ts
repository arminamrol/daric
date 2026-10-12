import { Injectable, NotFoundException } from '@nestjs/common';
import {
  amountToWire,
  currencyByCode,
  money,
  monthPeriodOfDay,
  periodDays,
  periodParam,
  periodReport,
  todayIn,
  trendMonths,
  trendReport,
} from '@daric/core';
import type { Period, ReportWire } from '@daric/core';
import { and, eq, gte, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Membership } from '../../common/request';
import { accounts, categories, transactionLabels, transactions, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { ratesInto } from '../exchange-rates/exchange-rates.service';

// Queries read the whole table: WorkspaceGuard and row-level security keep
// them inside the caller's Workspace (ADR-0001).
@Injectable()
export class ReportsService {
  /**
   * The report of `asked` (the current month in the Workspace timezone by
   * default), with the trend of the twelve months up to its last month, in the
   * Base Currency.
   */
  async get(membership: Membership, asked?: Period): Promise<ReportWire> {
    const tx = scopedTx();
    const [workspace] = await tx
      .select({
        calendar: workspaces.calendar,
        timezone: workspaces.timezone,
        baseCurrency: workspaces.baseCurrency,
      })
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    const { calendar, baseCurrency } = workspace;
    const today = todayIn(new Date(), workspace.timezone);
    const period = asked ?? monthPeriodOfDay(today, calendar);
    const months = trendMonths(period, calendar, today);

    // The trend ends with the Period's last month, so only its start can reach further back.
    const days = periodDays(period, calendar);
    const [first] = months;
    const trendFrom = first ? periodDays(first, calendar).from : days.from;
    const from = trendFrom < days.from ? trendFrom : days.from;
    const rows = await tx
      .select({
        type: transactions.type,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        occurredOn: transactions.occurredOn,
        currency: accounts.currency,
        labelIds: sql<string[]>`(
          SELECT coalesce(array_agg(${transactionLabels.labelId}), '{}')::text[]
          FROM ${transactionLabels} WHERE ${transactionLabels.transactionId} = ${transactions.id}
        )`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          isNull(transactions.deletedAt),
          ne(transactions.type, 'TRANSFER'),
          gte(transactions.occurredOn, from),
          lt(transactions.occurredOn, days.until),
        ),
      );
    const categoryRows = await tx
      .select({ id: categories.id, kind: categories.kind, parentId: categories.parentId })
      .from(categories);

    const input = {
      calendar,
      today,
      base: currencyByCode(baseCurrency),
      rates: await ratesInto(baseCurrency),
      transactions: rows.map((row) => ({
        ...row,
        amount: money(row.amount, currencyByCode(row.currency)),
      })),
    };
    const report = periodReport({ ...input, period, categories: categoryRows });
    const trend = trendReport({ ...input, months });

    return {
      period: periodParam(period),
      from: report.from,
      to: report.to,
      rateDay: report.rateDay,
      baseCurrency,
      income: amountToWire(report.income),
      expense: amountToWire(report.expense),
      net: amountToWire(report.net),
      categories: report.categories.map((line) => ({
        categoryId: line.categoryId,
        type: line.type,
        total: amountToWire(line.total),
        own: amountToWire(line.own),
        share: line.share,
        children: line.children.map((child) => ({ ...child, total: amountToWire(child.total) })),
      })),
      labels: report.labels.map((line) => ({
        ...line,
        income: amountToWire(line.income),
        expense: amountToWire(line.expense),
      })),
      unlabeled: {
        income: amountToWire(report.unlabeled.income),
        expense: amountToWire(report.unlabeled.expense),
      },
      ratesUsed: report.ratesUsed,
      missing: report.missing,
      trend: trend.map((point) => ({
        month: periodParam(point.month),
        income: amountToWire(point.income),
        expense: amountToWire(point.expense),
        net: amountToWire(point.net),
        missing: point.missing,
      })),
    };
  }
}
