import type { MyWorkspace } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useI18n } from '../i18n/locale';

/**
 * Shown instead of a Workspace whose Owner's Plus and Grace Period have ended
 * (ADR-0008): the User is still a Member, but their access is paused until the
 * Owner renews. Nothing in it was deleted.
 */
export function SuspendedWorkspace({ workspace }: { workspace: MyWorkspace }) {
  const { t } = useI18n();
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-surface px-6 py-5">
      <h1 className="text-xl font-bold">{t('suspended.title')}</h1>
      <p>{t('suspended.body', { name: isolate(workspace.name) })}</p>
      <p className="text-sm text-foreground-muted">{t('suspended.switch')}</p>
    </section>
  );
}
