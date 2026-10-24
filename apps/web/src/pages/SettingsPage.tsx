import { hasRole } from '@daric/core';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { DisplayPreview } from '../settings/DisplayPreview';
import { ExportData } from '../settings/ExportData';
import { PreferencesForm } from '../settings/PreferencesForm';
import { WorkspaceSettingsForm } from '../settings/WorkspaceSettingsForm';
import { Button } from '../ui/Button';

/** A row leading to a Settings sub-page; its chevron points onward, so it turns in right-to-left. */
function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-touch items-center justify-between gap-3 px-card py-2 font-medium transition-colors duration-(--daric-duration-fast) hover:bg-surface-muted"
      >
        {children}
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-foreground-muted rtl:-scale-x-100"
        />
      </Link>
    </li>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { me, workspace } = useSignedIn();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-section">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <nav
        aria-label={t('settings.sections')}
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-card"
      >
        <ul className="divide-y divide-border">
          <SectionLink to="/settings/subscription">{t('subscription.link')}</SectionLink>
          <SectionLink to="/settings/members">{t('members.link')}</SectionLink>
          <SectionLink to="/settings/consents">{t('consents.link')}</SectionLink>
          {workspace.role === 'OWNER' && (
            <SectionLink to="/settings/audit">{t('audit.link')}</SectionLink>
          )}
        </ul>
      </nav>
      <DisplayPreview />
      <PreferencesForm preferences={me.preferences} />
      <WorkspaceSettingsForm workspace={workspace} />
      {hasRole(workspace.role, 'ADMIN') && <ExportData workspaceId={workspace.id} />}
      <Button asChild variant="danger" className="w-fit">
        <Link to="/settings/delete-account">{t('deleteAccount.link')}</Link>
      </Button>
    </div>
  );
}
