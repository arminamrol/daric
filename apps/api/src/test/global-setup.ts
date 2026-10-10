import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';
import { createDatabase } from '../db/client';
import { runMigrations } from '../db/migrate';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Recreates `<DATABASE_URL's database>_test` and migrates it before the run. */
export default async function setup(project: TestProject): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (!process.env['DATABASE_URL'] && existsSync(envFile)) process.loadEnvFile(envFile);
  const baseUrl = process.env['DATABASE_URL'];
  if (!baseUrl) throw new Error('DATABASE_URL is not set; copy .env.example to .env');

  const url = new URL(baseUrl);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.end();
  }

  url.pathname = `/${testDb}`;
  const { db, pool } = createDatabase(url.toString());
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
  project.provide('databaseUrl', url.toString());
}
