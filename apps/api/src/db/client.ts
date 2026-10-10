import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything queries can run on: the pool-backed database or an open transaction. */
export type Executor = Database | Transaction;

export function createDatabase(url: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}

/** The single row an INSERT … RETURNING or a lookup must produce. */
export function one<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('Expected exactly one row');
  return row;
}
