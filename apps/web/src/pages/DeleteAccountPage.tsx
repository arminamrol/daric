import { ApiError } from '@daric/api-client';
import type { AccountDeletionPreview } from '@daric/core';
import { isolate } from '@daric/i18n';
import { type FormEvent, useId } from 'react';
import { useNavigate } from 'react-router';
import { inputClass } from '../auth/AuthForm';
import { currentWorkspace } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useAccountDeletion, useDeleteAccount } from '../settings/accountDeletion';
import { useFormatters } from '../settings/settings';

const cardClass = 'flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6';
const alertClass = 'rounded-md bg-surface-muted px-3 py-2 text-sm text-danger';
const dangerClass =
  'w-fit rounded-md border border-danger px-4 py-2 font-medium text-danger disabled:opacity-60';
const secondaryClass =
  'w-fit rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground';

/** The Workspaces that keep the account alive until each has a new Owner. */
function SharedWorkspaces({ shared }: { shared: AccountDeletionPreview['sharedWorkspaces'] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const format = useFormatters();
  const titleId = useId();

  return (
    <div className="flex flex-col gap-2">
      <p id={titleId} className="font-medium">
        {t('deleteAccount.shared')}
      </p>
      <ul aria-labelledby={titleId} className="flex flex-col divide-y divide-border">
        {shared.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="me-auto">
              {t('deleteAccount.sharedItem', {
                name: isolate(w.name),
                count: format.count(w.otherMembers),
              })}
            </span>
            <button
              type="button"
              onClick={() => {
                currentWorkspace.set(w.id);
                void navigate('/settings/members');
              }}
              className={secondaryClass}
            >
              {t('deleteAccount.chooseOwner')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteForm() {
  const { t } = useI18n();
  const remove = useDeleteAccount();
  const passwordId = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    if (password) remove.mutate(password);
  }

  const wrongPassword =
    remove.error instanceof ApiError &&
    (remove.error.body as { reason?: string } | undefined)?.reason === 'WRONG_PASSWORD';

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={passwordId} className="font-medium">
          {t('deleteAccount.password')}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          dir="ltr"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      {remove.isError && (
        <p role="alert" className={alertClass}>
          {t(wrongPassword ? 'deleteAccount.wrongPassword' : 'deleteAccount.failed')}
        </p>
      )}
      <button type="submit" disabled={remove.isPending} className={dangerClass}>
        {t('deleteAccount.submit')}
      </button>
    </form>
  );
}

/**
 * Deletes the User's account for good after the password is given again. A
 * Workspace they own with others needs a new Owner first; bought Plus time is
 * lost with the account.
 */
export function DeleteAccountPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const preview = useAccountDeletion();
  const titleId = useId();
  const deletedId = useId();

  return (
    <section aria-labelledby={titleId} className={`mx-auto max-w-2xl ${cardClass}`}>
      <h1 id={titleId} className="text-2xl font-bold">
        {t('deleteAccount.title')}
      </h1>
      <p>{t('deleteAccount.intro')}</p>
      {preview.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : preview.isError ? (
        <p role="alert" className="text-danger">
          {t('deleteAccount.loadFailed')}
        </p>
      ) : (
        <>
          {preview.data.deletedWorkspaces.length > 0 && (
            <div className="flex flex-col gap-1">
              <p id={deletedId}>{t('deleteAccount.deleted')}</p>
              <ul aria-labelledby={deletedId} className="list-inside list-disc">
                {preview.data.deletedWorkspaces.map((w) => (
                  <li key={w.id}>{w.name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-foreground-muted">{t('deleteAccount.kept')}</p>
          {preview.data.plusForfeitedUntil && (
            <p className="rounded-md border border-danger px-3 py-2 text-sm">
              {t('deleteAccount.plusForfeited', {
                date: isolate(
                  format.date(new Date(preview.data.plusForfeitedUntil), { style: 'long' }),
                ),
              })}
            </p>
          )}
          {preview.data.sharedWorkspaces.length > 0 ? (
            <SharedWorkspaces shared={preview.data.sharedWorkspaces} />
          ) : (
            <DeleteForm />
          )}
        </>
      )}
    </section>
  );
}
