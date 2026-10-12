import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { exportFiles, todayIn, type ExportFormat } from '@daric/core';
import { asc, eq, getTableColumns, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { ClientInfo } from '../../common/request';
import {
  accounts,
  accountValuations,
  budgets,
  categories,
  exchangeRates,
  labels,
  netWorthSnapshots,
  plannedItems,
  projectionSettings,
  recurringOccurrences,
  recurringRules,
  transactionLabels,
  transactions,
  workspaceMembers,
  workspaces,
} from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { exportCsvZip, exportJson, exportValue, type ExportRow, type WorkspaceData } from './files';

type WorkspaceTable = PgTable & { workspaceId: AnyColumn };

/**
 * Every entity a Workspace holds, each with every column, in a stable order.
 * A new Workspace table belongs here. Audit logs are left out: they hold other
 * Members' IP addresses.
 */
const entities: { name: string; table: WorkspaceTable; order: AnyColumn[] }[] = [
  {
    name: 'members',
    table: workspaceMembers,
    order: [workspaceMembers.createdAt, workspaceMembers.id],
  },
  { name: 'accounts', table: accounts, order: [accounts.createdAt, accounts.id] },
  {
    name: 'valuations',
    table: accountValuations,
    order: [accountValuations.valuedOn, accountValuations.id],
  },
  {
    name: 'exchangeRates',
    table: exchangeRates,
    order: [exchangeRates.effectiveOn, exchangeRates.id],
  },
  {
    name: 'netWorthSnapshots',
    table: netWorthSnapshots,
    order: [netWorthSnapshots.day, netWorthSnapshots.createdAt, netWorthSnapshots.id],
  },
  { name: 'categories', table: categories, order: [categories.createdAt, categories.id] },
  { name: 'labels', table: labels, order: [labels.createdAt, labels.id] },
  {
    name: 'transactions',
    table: transactions,
    order: [transactions.occurredOn, transactions.createdAt, transactions.id],
  },
  {
    name: 'transactionLabels',
    table: transactionLabels,
    order: [transactionLabels.transactionId, transactionLabels.labelId],
  },
  {
    name: 'recurringRules',
    table: recurringRules,
    order: [recurringRules.createdAt, recurringRules.id],
  },
  {
    name: 'recurringOccurrences',
    table: recurringOccurrences,
    order: [recurringOccurrences.ruleId, recurringOccurrences.dueOn],
  },
  { name: 'budgets', table: budgets, order: [budgets.createdAt, budgets.id] },
  { name: 'plannedItems', table: plannedItems, order: [plannedItems.createdAt, plannedItems.id] },
  {
    name: 'projectionSettings',
    table: projectionSettings,
    order: [projectionSettings.workspaceId],
  },
];

const toExportRow = (row: Record<string, unknown>): ExportRow =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, exportValue(value)]));

export interface ExportFile {
  body: Uint8Array;
  contentType: string;
  fileName: string;
}

/** A Workspace's data as a file to download, on every Plan (ADR-0008: data is never held back). */
@Injectable()
export class ExportService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async export(
    workspaceId: string,
    userId: string,
    format: ExportFormat,
    client: ClientInfo,
  ): Promise<ExportFile> {
    const now = new Date();
    const { timezone, data } = await this.read(workspaceId);
    await this.audit.record(scopedTx(), {
      action: 'workspace.export',
      actorUserId: userId,
      workspaceId,
      client,
      metadata: { format },
    });
    const { extension, contentType } = exportFiles[format];
    return {
      body: format === 'csv' ? exportCsvZip(data) : new TextEncoder().encode(exportJson(data, now)),
      contentType,
      fileName: `daric-export-${todayIn(now, timezone)}.${extension}`,
    };
  }

  /**
   * Row-level security already limits every read to the Workspace; the filter
   * says so again because an export leaking another Workspace's rows is the worst case.
   */
  private async read(workspaceId: string): Promise<{ timezone: string; data: WorkspaceData }> {
    const tx = scopedTx();
    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    if (!workspace) throw new NotFoundException();
    const rowsByEntity = [];
    for (const { name, table, order } of entities) {
      const rows = await tx
        .select()
        .from(table)
        .where(eq(table.workspaceId, workspaceId))
        .orderBy(...order.map((column) => asc(column)));
      rowsByEntity.push({
        name,
        columns: Object.keys(getTableColumns(table)),
        rows: (rows as Record<string, unknown>[]).map(toExportRow),
      });
    }
    return {
      timezone: workspace.timezone,
      data: { workspace: toExportRow(workspace), entities: rowsByEntity },
    };
  }
}
