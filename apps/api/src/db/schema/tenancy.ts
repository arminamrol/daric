import { jsonb, pgEnum, pgTable, text, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { calendarSystems, moneyDisplays, workspaceRoles, workspaceTypes } from '@daric/core';
import { id, timestamps, version } from './columns';
import { users } from './identity';

export const workspaceType = pgEnum('workspace_type', workspaceTypes);
export const workspaceCalendar = pgEnum('workspace_calendar', calendarSystems);
export const workspaceRole = pgEnum('workspace_role', workspaceRoles);
export const moneyDisplay = pgEnum('money_display', moneyDisplays);

export const workspaces = pgTable('workspaces', {
  id: id(),
  type: workspaceType('type').notNull(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('IRR'),
  calendar: workspaceCalendar('calendar').notNull().default('jalali'),
  timezone: text('timezone').notNull().default('Asia/Tehran'),
  moneyDisplay: moneyDisplay('money_display').notNull().default('rial'),
  settings: jsonb('settings').notNull().default({}),
  ...timestamps(),
  version: version(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    uniqueIndex('workspace_members_workspace_id_user_id_key').on(t.workspaceId, t.userId),
    index('workspace_members_user_id_idx').on(t.userId),
  ],
);
