import type { Key, ReactNode } from 'react';
import { cn } from './cn';

export interface Column<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers line up at the end. */
  align?: 'start' | 'end';
  /** The row's name: on a phone it heads the row's card instead of being labelled. */
  primary?: boolean;
}

/**
 * Rows of the same kind: a table on wide screens, a card per row on a phone, from the same
 * markup. The roles are spelled out, as a table laid out as blocks loses them in some browsers.
 */
export function ResponsiveTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  className,
}: {
  /** Names the table for screen readers; shown only to them. */
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => Key;
  className?: string;
}) {
  return (
    <table
      role="table"
      className={cn(
        'block w-full text-sm md:table md:rounded-lg md:border md:border-border md:bg-surface',
        className,
      )}
    >
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup" className="sr-only md:not-sr-only md:table-header-group">
        <tr role="row" className="md:border-b md:border-border">
          {columns.map((column) => (
            <th
              key={column.key}
              role="columnheader"
              scope="col"
              className={cn(
                'px-4 py-3 font-medium text-foreground-muted',
                column.align === 'end' ? 'text-end' : 'text-start',
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="flex flex-col gap-2 md:table-row-group">
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            role="row"
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 md:table-row md:rounded-none md:border-0 md:border-b md:last:border-b-0"
          >
            {columns.map((column) => (
              <td
                key={column.key}
                role="cell"
                className={cn(
                  'flex items-baseline justify-between gap-3 md:table-cell md:px-4 md:py-3',
                  column.align === 'end' && 'tabular-nums md:text-end',
                  column.primary && 'font-medium',
                )}
              >
                {/* The column's name beside each value on a phone; the header says it on wide. */}
                {!column.primary && (
                  <span aria-hidden className="text-foreground-muted md:hidden">
                    {column.header}
                  </span>
                )}
                <span className="min-w-0">{column.cell(row)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
