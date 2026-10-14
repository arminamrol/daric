import { categoryTree, hasRole, swapWithNeighbour } from '@daric/core';
import type { Category, CategoryKind } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../../auth/session';
import { CategoryBadge } from '../../../categories/CategoryBadge';
import { KIND_ORDER, useCategories } from '../../../categories/categories';
import { edited, useWrite } from '../../../data/writes';
import { useI18n } from '../../../i18n/locale';
import { Choices } from '../../../ui/Choices';
import { FormMessage } from '../../../ui/Form';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { ListScreen } from '../../../ui/ListScreen';
import { Status } from '../../../ui/Screen';
import { useTheme } from '../../../ui/theme';
import { Toggle } from '../../../ui/Toggle';

/**
 * One kind's Categories as a tree, each parent followed by its children, in
 * order; Owners and Admins move them up and down and open them to edit.
 */
export default function CategoriesScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [kind, setKind] = useState<CategoryKind>('EXPENSE');
  const [showArchived, setShowArchived] = useState(false);
  const [said, setSaid] = useState<string>();
  const categories = useCategories();
  const reorder = useWrite();
  const canManage = hasRole(workspace.role, 'ADMIN');

  const all = useMemo(() => categories.data ?? [], [categories.data]);
  const visible = useMemo(
    () =>
      categoryTree(all.filter((c) => c.kind === kind && (showArchived || !c.archived))).flatMap(
        ({ children, ...top }) => [top, ...children],
      ),
    [all, kind, showArchived],
  );

  const header = (
    <ScreenHeader
      title={t('categories.title')}
      action={
        canManage && {
          label: t('categories.new'),
          onPress: () => router.push(`/categories/new?kind=${kind}`),
        }
      }
    />
  );
  if (categories.isPending)
    return (
      <>
        {header}
        <Status message={t('session.loading')} />
      </>
    );
  if (!categories.data)
    return (
      <>
        {header}
        <Status alert message={t('categories.loadFailed')} />
      </>
    );

  function move(category: Category, direction: -1 | 1) {
    const ids = swapWithNeighbour(all, visible, category, direction);
    if (!ids) return;
    const group = `${category.kind}:${category.parentId ?? 'top'}`;
    const name = isolate(category.name);
    reorder.mutate(edited(group, { entity: 'categoryOrder', fields: { ids } }), {
      onSuccess: () =>
        setSaid(t(direction < 0 ? 'categories.movedUp' : 'categories.movedDown', { name })),
      onError: () => setSaid(undefined),
    });
  }

  return (
    <>
      {header}
      <ListScreen<Category>
        sections={[{ key: kind, data: visible }]}
        keyOf={(c) => c.id}
        header={
          <>
            <Choices
              label={t('categories.kind')}
              choices={KIND_ORDER.map((k) => ({ id: k, label: t(`categories.kind.${k}`) }))}
              selected={kind}
              onSelect={(id) => setKind(id as CategoryKind)}
            />
            <Toggle
              label={t('categories.showArchived')}
              value={showArchived}
              onChange={setShowArchived}
            />
            <FormMessage tone="success" message={said} />
            <FormMessage message={reorder.isError ? t('categories.reorderFailed') : undefined} />
          </>
        }
        renderItem={(category) => {
          const name = isolate(category.name);
          return (
            <View style={category.parentId ? styles.child : undefined}>
              <ListRow
                title={category.name}
                leading={<CategoryBadge icon={category.icon} color={category.color} size="sm" />}
                lines={[category.archived && t('categories.archived')]}
                state={categories.states?.get(category.id)}
                actionLabel={canManage ? t('categories.edit', { name }) : undefined}
                onPress={canManage ? () => router.push(`/categories/${category.id}`) : undefined}
              >
                {canManage && (
                  <View style={styles.moves}>
                    <MoveButton
                      label={t('categories.moveUp', { name })}
                      onPress={() => move(category, -1)}
                      icon={<ChevronUp color={colors.foreground} size={20} />}
                    />
                    <MoveButton
                      label={t('categories.moveDown', { name })}
                      onPress={() => move(category, 1)}
                      icon={<ChevronDown color={colors.foreground} size={20} />}
                    />
                  </View>
                )}
              </ListRow>
            </View>
          );
        }}
        empty={t('categories.empty')}
        refreshing={categories.isRefetching}
        onRefresh={() => void categories.refetch()}
      />
    </>
  );
}

function MoveButton({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={styles.move}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  child: { paddingStart: nativeTheme.space(6) },
  moves: { flexDirection: 'row' },
  move: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
