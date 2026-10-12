import { todayIn } from '@daric/core';
import { AccountsService } from '../../modules/accounts/accounts.service';
import { AuditService } from '../../modules/audit/audit.service';
import { NetWorthService } from '../../modules/net-worth/net-worth.service';
import { createDatabase } from '../client';
import { DEMO_EMAIL, seedDemo } from './demo';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
// The seed deletes and recreates the demo User; keep it away from real data.
if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed in production');

const { db, pool } = createDatabase(url);
try {
  const now = new Date();
  const { workspaceId } = await seedDemo(db, { today: todayIn(now, 'Asia/Tehran') });
  // What the API's month-end job would do on its next run, for the demo Workspace only.
  const audit = new AuditService();
  const netWorth = new NetWorthService(db, new AccountsService(audit), audit);
  await netWorth.takeDueAutoSnapshots(now, { workspaceId });
  console.warn(`Demo data seeded. Log in as ${DEMO_EMAIL} (password in README).`);
} finally {
  await pool.end();
}
