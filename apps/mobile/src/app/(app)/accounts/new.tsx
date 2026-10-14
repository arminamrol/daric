import { hasRole } from '@daric/core';
import { AccountForm } from '../../../accounts/AccountForm';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Account. */
export default function NewAccountScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  return (
    <>
      <ScreenHeader title={t('accounts.form.newTitle')} />
      {hasRole(workspace.role, 'ADMIN') ? (
        <AccountForm />
      ) : (
        <Status alert message={t('accounts.readOnly')} />
      )}
    </>
  );
}
