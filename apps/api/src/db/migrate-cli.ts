import { createDatabase } from './client';
import { runMigrations } from './migrate';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDatabase(url);
try {
  await runMigrations(db);
  console.warn('Migrations applied.');
} finally {
  await pool.end();
}
