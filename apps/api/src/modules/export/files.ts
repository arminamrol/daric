import { strToU8, zipSync } from 'fflate';

/** A value as the export writes it: Amounts and other bigints as strings, times as ISO strings. */
export type ExportValue = string | number | boolean | null | object;
export type ExportRow = Record<string, ExportValue>;

/** Every row of a Workspace, by entity, with each entity's columns in order. */
export interface WorkspaceData {
  workspace: ExportRow;
  entities: { name: string; columns: string[]; rows: ExportRow[] }[];
}

export function exportValue(value: unknown): ExportValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value as ExportValue;
}

/** One JSON document: the Workspace, then each entity's rows. */
export function exportJson(data: WorkspaceData, exportedAt: Date): string {
  return JSON.stringify({
    format: 'daric-export',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    workspace: data.workspace,
    ...Object.fromEntries(data.entities.map((e) => [e.name, e.rows])),
  });
}

/** A zip of `<entity>.csv` for the Workspace and each entity, a header row first. */
export function exportCsvZip(data: WorkspaceData): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'workspace.csv': strToU8(toCsv(Object.keys(data.workspace), [data.workspace])),
  };
  for (const entity of data.entities) {
    files[`${entity.name}.csv`] = strToU8(toCsv(entity.columns, entity.rows));
  }
  return zipSync(files);
}

/**
 * RFC 4180 CSV with a byte-order mark, so spreadsheets read Persian text as
 * UTF-8. Null is an empty cell; objects are written as JSON.
 */
export function toCsv(columns: string[], rows: ExportRow[]): string {
  const lines = [columns, ...rows.map((row) => columns.map((c) => csvText(row[c] ?? null)))];
  return `\uFEFF${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function csvText(value: ExportValue): string {
  if (value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(text: string): string {
  // A spreadsheet runs text starting like a formula; a leading quote keeps it text.
  const safe = FORMULA_START.test(text) && !NUMBER.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
