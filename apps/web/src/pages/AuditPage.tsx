import { type AuditAction, auditActions, type AuditEntry } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';

const known = (action: string): action is AuditAction =>
  (auditActions as readonly string[]).includes(action);

function EntryRow({ entry }: { entry: AuditEntry }) {
  const { t } = useI18n();
  const format = useFormatters();
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
      <span className="me-auto font-medium">
        {known(entry.action) ? t(`audit.action.${entry.action}`) : entry.action}
      </span>
      <span className="text-sm" dir={entry.actorEmail ? 'ltr' : undefined}>
        {entry.actorEmail ?? t('audit.nobody')}
      </span>
      <span className="text-sm text-foreground-muted">
        {isolate(format.date(new Date(entry.createdAt), { style: 'long' }))}
      </span>
    </li>
  );
}

/** `/settings/audit`: the Workspace's audit log, Owner only, newest first. */
export function AuditPage() {
  const { t } = useI18n();
  const api = useApi();
  const { workspace } = useSignedIn();
  const log = useInfiniteQuery({
    queryKey: ['audit', workspace.id],
    queryFn: ({ pageParam }) => api.listAudit(workspace.id, pageParam ? { before: pageParam } : {}),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next,
    enabled: workspace.role === 'OWNER',
  });
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  if (workspace.role !== 'OWNER') return <Navigate to="/settings" replace />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
      <p className="text-sm text-foreground-muted">{t('audit.hint')}</p>
      {log.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : log.isError ? (
        <p role="alert" className="text-danger">
          {t('audit.loadFailed')}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-foreground-muted">{t('audit.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface px-4">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {log.hasNextPage && (
        <button
          type="button"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
          className="w-fit rounded-md border border-border px-4 py-2 font-medium disabled:opacity-60"
        >
          {t('audit.more')}
        </button>
      )}
    </div>
  );
}
