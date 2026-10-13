import type { TransactionType } from '@daric/core';
import type { Settings } from '../storage/settings';

/** The Account and per-type Category last used on this phone, so the next entry starts from them. */
export interface LastPicks {
  accountId?: string;
  categoryIds?: Partial<Record<TransactionType, string>>;
}

/** Device-local picks that name Workspace data, wiped with it. */
const PREFIX = 'daric.lastPicks.';

export function readLastPicks(settings: Settings, workspaceId: string): LastPicks {
  try {
    const parsed: unknown = JSON.parse(settings.get(PREFIX + workspaceId) ?? 'null');
    return parsed && typeof parsed === 'object' ? (parsed as LastPicks) : {};
  } catch {
    return {};
  }
}

export function writeLastPicks(settings: Settings, workspaceId: string, picks: LastPicks): void {
  settings.set(PREFIX + workspaceId, JSON.stringify(picks));
}

/** Forgets the picks of every Workspace (logout). */
export function forgetLastPicks(settings: Settings): void {
  for (const key of settings.keys()) {
    if (key.startsWith(PREFIX)) settings.set(key, null);
  }
}
