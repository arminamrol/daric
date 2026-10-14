import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { AccountForm } from '../../../accounts/AccountForm';
import { useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: edits or archives an Account, archived ones too. */
export default function EditAccountScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  const accounts = useAccounts({ includeArchived: true });
  const account = accounts.data?.find((a) => a.id === id);
  return (
    <>
      <ScreenHeader title={t('accounts.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('accounts.readOnly')} />
      ) : accounts.isPending ? (
        <Status message={t('session.loading')} />
      ) : account ? (
        <AccountForm key={account.id} account={account} />
      ) : (
        <Status alert message={t('accounts.notFound')} />
      )}
    </>
  );
}
