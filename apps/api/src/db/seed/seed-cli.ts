import { todayIn } from '@daric/core';
import { createDatabase } from '../client';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './demo';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
// The seed deletes and recreates the demo User; keep it away from real data.
if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed in production');

const { db, pool } = createDatabase(url);
try {
  await seedDemo(db, { today: todayIn(new Date(), 'Asia/Tehran') });
  console.warn(`Demo data seeded. Log in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await pool.end();
}
