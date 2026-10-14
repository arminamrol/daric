import { parseEntityKey } from '@daric/api-client';
import type { QueuedWrite } from '@daric/api-client';
import { nativeTheme } from '@daric/design-tokens';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../auth/session';
import { useFormatters } from '../../display/formatters';
import { useI18n } from '../../i18n/locale';
import { useOfflineDevice, useWaitingWrites } from '../../offline/offline';
import { Button } from '../../ui/Button';
import { ScreenHeader } from '../../ui/HeaderButton';
import { ListRow } from '../../ui/ListRow';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';

/**
 * The changes not sent yet, oldest first. One the API refused waits to be
 * set aside; an edit of a Transaction changed elsewhere waits for the user to
 * keep theirs or the other.
 */
export default function SyncScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const { queue } = useOfflineDevice();
  const entries = useWaitingWrites(workspace.id);

  function describe(entry: QueuedWrite): { title: string; name: string } {
    const { entity } = parseEntityKey(entry.entityId);
    const what = t(`sync.entity.${entity}`);
    if (entry.kind === 'delete')
      return { title: t('sync.kind.delete', { entity: what }), name: '' };
    const write = entry.payload;
    if (!('entity' in write)) {
      return {
        title: t(`sync.kind.${entry.kind}`, { entity: what }),
        name: write.note ?? format.day(write.occurredOn),
      };
    }
    if (write.entity === 'occurrence') {
      return {
        title: t(`sync.occurrence.${write.fields.action}`),
        name: format.day(write.fields.dueOn),
      };
    }
    const name = 'name' in write.fields ? (write.fields.name ?? '') : '';
    return { title: t(`sync.kind.${entry.kind}`, { entity: what }), name };
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <ScreenHeader title={t('sync.title')} />
      {entries.length === 0 && (
        <Text tone="foregroundMuted" style={styles.empty}>
          {t('sync.empty')}
        </Text>
      )}
      {entries.map((entry) => {
        const { title, name } = describe(entry);
        const { scope, entityId } = entry;
        return (
          <View key={entry.seq} style={[styles.item, { borderColor: colors.border }]}>
            <ListRow
              title={title}
              lines={[
                name,
                entry.status === 'conflict' && t('sync.conflict'),
                entry.status === 'rejected' && t('sync.rejected'),
              ]}
              state={entry.status === 'pending' ? 'pending' : undefined}
            />
            {entry.status === 'conflict' && (
              <View style={styles.actions}>
                <Button
                  label={t('transactions.edit.keepTheirs')}
                  onPress={() => void queue.resolve(scope, entityId, 'theirs')}
                />
                <Button
                  primary
                  label={t('transactions.edit.keepMine')}
                  onPress={() => void queue.resolve(scope, entityId, 'mine')}
                />
              </View>
            )}
            {entry.status === 'rejected' && (
              <View style={styles.actions}>
                <Button
                  label={t('sync.discard')}
                  onPress={() => void queue.discard(scope, entityId)}
                />
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: nativeTheme.space(2) },
  empty: { textAlign: 'center', padding: nativeTheme.space(8) },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: nativeTheme.space(2) },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeTheme.space(2),
    paddingHorizontal: nativeTheme.space(4),
  },
});
