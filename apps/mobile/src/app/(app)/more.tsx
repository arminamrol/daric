import { hasRole } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../auth/session';
import { useFormatters } from '../../display/formatters';
import { LanguageChoices } from '../../i18n/LanguageChoices';
import { useI18n } from '../../i18n/locale';
import { useWaitingWrites } from '../../offline/offline';
import { useDueOccurrences } from '../../recurring/recurring';
import { ScreenHeader } from '../../ui/HeaderButton';
import { ListRow } from '../../ui/ListRow';
import { useTheme } from '../../ui/theme';

/**
 * The other parts of the app: insights, what the Workspace is made of, changes
 * not sent yet, and the language.
 */
export default function MoreScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const waiting = useWaitingWrites(workspace.id);
  // Viewers see no Due Occurrences waiting for them to confirm.
  const due = useDueOccurrences();
  const dueCount = hasRole(workspace.role, 'MEMBER') ? (due.data?.length ?? 0) : 0;

  const items: { title: string; line?: string | false; href: Href }[] = [
    { title: t('nav.netWorth'), href: '/net-worth' },
    { title: t('nav.projection'), href: '/projection' },
    { title: t('nav.reports'), href: '/reports' },
    { title: t('nav.accounts'), href: '/accounts' },
    { title: t('nav.categories'), href: '/categories' },
    { title: t('nav.labels'), href: '/labels' },
    { title: t('nav.budgets'), href: '/budgets' },
    {
      title: t('nav.recurring'),
      line: dueCount > 0 && t('nav.dueCount', { count: format.count(dueCount) }),
      href: '/recurring',
    },
    {
      title: t('sync.title'),
      line: waiting.length > 0 && t('sync.pending'),
      href: '/sync',
    },
  ];

  return (
    <ScrollView>
      <ScreenHeader title={t('nav.more')} />
      {items.map((item, index) => (
        <View key={String(item.href)}>
          {index > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
          <ListRow title={item.title} lines={[item.line]} onPress={() => router.push(item.href)} />
        </View>
      ))}
      <View style={[styles.settings, { borderTopColor: colors.border }]}>
        <LanguageChoices />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth },
  settings: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: nativeTheme.space(4),
  },
});
