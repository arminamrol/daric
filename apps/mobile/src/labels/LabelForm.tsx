import type { Label } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { created, edited, newId, refusedWith, useWrite } from '../data/writes';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';
import { readLabelDraft } from './form';

/** Creates a Label, or renames, flags and archives `label`. Names are unique in a Workspace. */
export function LabelForm({ label }: { label?: Label }) {
  const { t } = useI18n();
  const router = useRouter();
  const nameRef = useRef<TextInput>(null);
  const [name, setName] = useState(label?.name ?? '');
  const [controllable, setControllable] = useState(label?.controllable ?? false);
  const [nameError, setNameError] = useState(false);
  const [problem, setProblem] = useState<PlainMessageKey>();
  const save = useWrite();

  const options = {
    onSuccess: () => router.back(),
    // A 409 means another Label already has the name.
    onError: (error: Error) =>
      setProblem(refusedWith(error, 409) ? 'labels.error.nameTaken' : 'settings.saveFailed'),
  };

  function changed() {
    save.reset();
    setProblem(undefined);
  }

  function submit() {
    if (save.isPending) return;
    const read = readLabelDraft({ name, controllable });
    setNameError(!read.ok);
    if (!read.ok) return nameRef.current?.focus();
    if (!label) {
      save.mutate(created(newId(), { entity: 'label', fields: read.fields }), options);
      return;
    }
    const changes = changedFields(label, read.fields);
    if (Object.keys(changes).length === 0) return router.back();
    save.mutate(edited(label.id, { entity: 'label', fields: changes }), options);
  }

  return (
    <FormScroll>
      <Field
        ref={nameRef}
        autoFocus={!label}
        label={t('labels.form.name')}
        error={nameError ? t('labels.error.nameRequired') : undefined}
        value={name}
        onChangeText={(text) => {
          changed();
          setName(text);
        }}
        maxLength={100}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Toggle
        label={t('labels.form.controllable')}
        hint={t('labels.form.controllableHint')}
        value={controllable}
        onChange={(value) => {
          changed();
          setControllable(value);
        }}
      />
      <FormMessage message={problem && t(problem)} />
      <Button
        primary
        label={t(label ? 'labels.form.save' : 'labels.form.create')}
        onPress={submit}
        disabled={save.isPending}
      />
      {label && (
        <FormSection>
          <Button
            label={t(label.archived ? 'labels.form.unarchive' : 'labels.form.archive')}
            disabled={save.isPending}
            onPress={() =>
              save.mutate(
                edited(label.id, { entity: 'label', fields: { archived: !label.archived } }),
                options,
              )
            }
          />
          <Text size="sm" tone="foregroundMuted">
            {t('labels.form.archiveHint')}
          </Text>
        </FormSection>
      )}
    </FormScroll>
  );
}
