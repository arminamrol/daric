import type { Category, CategoryKind } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import type { PlainMessageKey } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native';
import { created, edited, newId, refusedWith, useWrite } from '../data/writes';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Choices } from '../ui/Choices';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { CategoryBadge } from './CategoryBadge';
import { useCategories } from './categories';
import { archiveProblem, parentChoices, readCategoryDraft } from './form';
import type { CategoryDraft } from './form';
import { ColorPicker, IconPicker } from './pickers';

const NO_PARENT = '';

/**
 * Creates a Category of `kind`, or edits, moves and archives `category`. Its
 * kind is fixed once created; a parent must be an active top-level Category
 * of the same kind, and a Category with children has no parent.
 */
export function CategoryForm({ category, kind }: { category?: Category; kind?: CategoryKind }) {
  const { t } = useI18n();
  const router = useRouter();
  const nameRef = useRef<TextInput>(null);
  const all = useCategories().data ?? [];
  const [draft, setDraft] = useState<CategoryDraft>(() =>
    category
      ? {
          kind: category.kind,
          parentId: category.parentId,
          name: category.name,
          icon: category.icon,
          color: category.color,
        }
      : { kind: kind ?? 'EXPENSE', parentId: null, name: '', icon: 'shopping-bag', color: 'blue' },
  );
  const [nameError, setNameError] = useState(false);
  const [problem, setProblem] = useState<PlainMessageKey>();
  const save = useWrite();
  const parents = parentChoices(all, draft.kind, category);
  const hasChildren = Boolean(category && all.some((c) => c.parentId === category.id));

  function change(next: Partial<CategoryDraft>) {
    save.reset();
    setProblem(undefined);
    setDraft((current) => ({ ...current, ...next }));
  }

  /** A 409 means an active Category would sit under an archived parent, or the reverse. */
  function failed(conflict: PlainMessageKey) {
    return (error: Error) => setProblem(refusedWith(error, 409) ? conflict : 'settings.saveFailed');
  }

  function submit() {
    if (save.isPending) return;
    const read = readCategoryDraft(draft);
    setNameError(!read.ok);
    if (!read.ok) return nameRef.current?.focus();
    const options = {
      onSuccess: () => router.back(),
      onError: failed('categories.error.parentArchived'),
    };
    if (!category) {
      save.mutate(created(newId(), { entity: 'category', fields: read.fields }), options);
      return;
    }
    const { kind: _, ...fields } = read.fields;
    const changes = changedFields(category, fields);
    if (Object.keys(changes).length === 0) return router.back();
    save.mutate(edited(category.id, { entity: 'category', fields: changes }), options);
  }

  function toggleArchived() {
    if (!category) return;
    // Say so before asking: the server would refuse it too.
    const refused = archiveProblem(category, all);
    if (refused) return setProblem(refused);
    save.mutate(
      edited(category.id, { entity: 'category', fields: { archived: !category.archived } }),
      {
        onSuccess: () => router.back(),
        onError: failed(
          category.archived
            ? 'categories.error.parentArchived'
            : 'categories.error.archiveChildrenFirst',
        ),
      },
    );
  }

  return (
    <FormScroll>
      <View style={styles.preview}>
        <CategoryBadge icon={draft.icon} color={draft.color} />
        <Text bold>{draft.name.trim() || t(`categories.kind.${draft.kind}`)}</Text>
      </View>
      {category ? (
        <Text size="sm" tone="foregroundMuted">
          {t('categories.kind')}: {t(`categories.kind.${draft.kind}`)} —{' '}
          {t('categories.form.kindFixed')}
        </Text>
      ) : (
        <Choices
          label={t('categories.kind')}
          choices={(['EXPENSE', 'INCOME'] as const).map((k) => ({
            id: k,
            label: t(`categories.kind.${k}`),
          }))}
          selected={draft.kind}
          onSelect={(id) => change({ kind: id as CategoryKind, parentId: null })}
        />
      )}
      <Field
        ref={nameRef}
        autoFocus={!category}
        label={t('categories.form.name')}
        error={nameError ? t('categories.error.nameRequired') : undefined}
        value={draft.name}
        onChangeText={(name) => change({ name })}
        maxLength={100}
      />
      {hasChildren ? (
        <Text size="sm" tone="foregroundMuted">
          {t('categories.form.hasChildren')}
        </Text>
      ) : (
        <>
          <Choices
            label={t('categories.form.parent')}
            choices={[
              { id: NO_PARENT, label: t('categories.form.noParent') },
              ...parents.map((p) => ({ id: p.id, label: p.name })),
            ]}
            selected={draft.parentId ?? NO_PARENT}
            onSelect={(id) => change({ parentId: id === NO_PARENT ? null : id })}
          />
          <Text size="sm" tone="foregroundMuted">
            {t('categories.form.parentHint')}
          </Text>
        </>
      )}
      <IconPicker value={draft.icon} color={draft.color} onChange={(icon) => change({ icon })} />
      <ColorPicker value={draft.color} onChange={(color) => change({ color })} />
      <FormMessage message={problem && t(problem)} />
      <Button
        primary
        label={t(category ? 'categories.form.save' : 'categories.form.create')}
        onPress={submit}
        disabled={save.isPending}
      />
      {category && (
        <FormSection>
          <Button
            label={t(category.archived ? 'categories.form.unarchive' : 'categories.form.archive')}
            disabled={save.isPending}
            onPress={toggleArchived}
          />
          <Text size="sm" tone="foregroundMuted">
            {t('categories.form.archiveHint')}
          </Text>
        </FormSection>
      )}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(3) },
});
