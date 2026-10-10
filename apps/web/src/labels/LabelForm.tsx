import { ApiError } from '@daric/api-client';
import type { Label } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useCreateLabel, useUpdateLabel } from './labels';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

/** Creates a Label, or renames, flags and archives `label`. Names are unique in a Workspace. */
export function LabelForm({ label }: { label?: Label }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const id = useId();
  const ids = {
    title: `${id}-title`,
    name: `${id}-name`,
    nameError: `${id}-name-error`,
    controllable: `${id}-controllable`,
    controllableHint: `${id}-controllable-hint`,
    archiveHint: `${id}-archive-hint`,
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(label?.name ?? '');
  const [controllable, setControllable] = useState(label?.controllable ?? false);
  const [nameError, setNameError] = useState(false);
  const [problem, setProblem] = useState<PlainMessageKey | null>(null);
  const create = useCreateLabel();
  const update = useUpdateLabel(label?.id ?? '');
  const save = label ? update : create;

  function changed() {
    save.reset();
    setProblem(null);
  }

  /** A 409 means another Label already has the name. */
  function onError(error: Error) {
    setProblem(
      error instanceof ApiError && error.status === 409
        ? 'labels.error.nameTaken'
        : 'settings.saveFailed',
    );
  }

  function done() {
    void navigate('/labels');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    setNameError(trimmed === '');
    if (trimmed === '') return nameRef.current?.focus();

    const fields = { name: trimmed, controllable };
    if (label) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => label[key as keyof typeof fields] !== value,
        ),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError });
    } else {
      create.mutate(fields, { onSuccess: done, onError });
    }
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <h1 id={ids.title} className="me-auto text-2xl font-bold">
          {t(label ? 'labels.form.editTitle' : 'labels.form.newTitle')}
        </h1>
        <Link to="/labels" className="text-sm font-medium text-accent underline underline-offset-4">
          {t('labels.back')}
        </Link>
      </div>
      <form
        aria-labelledby={ids.title}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.name} className="font-medium">
            {t('labels.form.name')}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            value={name}
            maxLength={100}
            onChange={(e) => {
              changed();
              setName(e.target.value);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? ids.nameError : undefined}
            className={inputClass}
          />
          {nameError && (
            <p id={ids.nameError} className="text-sm text-danger">
              {t('labels.error.nameRequired')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <input
              id={ids.controllable}
              type="checkbox"
              checked={controllable}
              onChange={(e) => {
                changed();
                setControllable(e.target.checked);
              }}
              aria-describedby={ids.controllableHint}
              className="size-4"
            />
            <label htmlFor={ids.controllable} className="font-medium">
              {t('labels.form.controllable')}
            </label>
          </div>
          <p id={ids.controllableHint} className="text-sm text-foreground-muted">
            {t('labels.form.controllableHint')}
          </p>
        </div>
        {problem && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t(problem)}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t(label ? 'labels.form.save' : 'labels.form.create')}
        </button>
      </form>
      {label && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ archived: !label.archived }, { onSuccess: done, onError })
            }
            aria-describedby={ids.archiveHint}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium disabled:opacity-60"
          >
            {t(label.archived ? 'labels.form.unarchive' : 'labels.form.archive')}
          </button>
          <p id={ids.archiveHint} className="text-sm text-foreground-muted">
            {t('labels.form.archiveHint')}
          </p>
        </div>
      )}
    </section>
  );
}
