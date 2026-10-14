import { hasRole } from '@daric/core';
import type { Label } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useSignedIn } from '../../../auth/session';
import { useI18n } from '../../../i18n/locale';
import { useLabels } from '../../../labels/labels';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { ListScreen } from '../../../ui/ListScreen';
import { Status } from '../../../ui/Screen';
import { Toggle } from '../../../ui/Toggle';

/** The Labels by name, marking the controllable ones; archived ones when asked. */
export default function LabelsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [showArchived, setShowArchived] = useState(false);
  const labels = useLabels();
  const canManage = hasRole(workspace.role, 'ADMIN');

  const header = (
    <ScreenHeader
      title={t('labels.title')}
      action={canManage && { label: t('labels.new'), onPress: () => router.push('/labels/new') }}
    />
  );
  if (labels.isPending)
    return (
      <>
        {header}
        <Status message={t('session.loading')} />
      </>
    );
  if (!labels.data)
    return (
      <>
        {header}
        <Status alert message={t('labels.loadFailed')} />
      </>
    );

  return (
    <>
      {header}
      <ListScreen<Label>
        sections={[{ key: 'labels', data: labels.data.filter((l) => showArchived || !l.archived) }]}
        keyOf={(l) => l.id}
        header={
          <Toggle
            label={t('labels.showArchived')}
            value={showArchived}
            onChange={setShowArchived}
          />
        }
        renderItem={(label) => (
          <ListRow
            title={label.name}
            lines={[
              label.controllable && t('labels.controllable'),
              label.archived && t('labels.archived'),
            ]}
            state={labels.states?.get(label.id)}
            actionLabel={canManage ? t('labels.edit', { name: isolate(label.name) }) : undefined}
            onPress={canManage ? () => router.push(`/labels/${label.id}`) : undefined}
          />
        )}
        empty={t('labels.empty')}
        refreshing={labels.isRefetching}
        onRefresh={() => void labels.refetch()}
      />
    </>
  );
}
