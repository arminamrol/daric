import { ApiError } from '@daric/api-client';
import type { Category, CategoryColor, CategoryIcon, CategoryKind } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../i18n/locale';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { CategoryBadge } from './CategoryBadge';
import { KIND_ORDER, useCategories, useCreateCategory, useUpdateCategory } from './categories';
import { CATEGORY_KIND_LABELS } from './labels';
import { ColorPicker, IconPicker } from './pickers';

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60';

interface Draft {
  kind: CategoryKind;
  parentId: string | null;
  name: string;
  icon: CategoryIcon;
  color: CategoryColor;
}

/**
 * Creates a Category of `kind`, or edits, moves and archives `category`.
 * Its kind is fixed once created; a parent must be an active top-level
 * Category of the same kind, and a Category with children has no parent.
 */
export function CategoryForm({ category, kind }: { category?: Category; kind?: CategoryKind }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const id = useId();
  const ids = {
    title: `${id}-title`,
    name: `${id}-name`,
    nameError: `${id}-name-error`,
    parent: `${id}-parent`,
    parentHint: `${id}-parent-hint`,
    archiveHint: `${id}-archive-hint`,
  };
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() =>
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
  const [problem, setProblem] = useState<PlainMessageKey | null>(null);
  const all = useCategories().data ?? [];
  const create = useCreateCategory();
  const update = useUpdateCategory(category?.id ?? '');
  const save = category ? update : create;

  const children = category ? all.filter((c) => c.parentId === category.id) : [];
  const parents = all.filter(
    (c) =>
      c.kind === draft.kind &&
      c.parentId === null &&
      c.id !== category?.id &&
      (!c.archived || c.id === category?.parentId),
  );

  function change(next: Partial<Draft>) {
    save.reset();
    setProblem(null);
    setDraft((current) => ({ ...current, ...next }));
  }

  /** A 409 means an active Category would sit under an archived parent, or the reverse. */
  function onError(error: Error, conflict: PlainMessageKey) {
    setProblem(
      error instanceof ApiError && error.status === 409 ? conflict : 'settings.saveFailed',
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    setNameError(name === '');
    if (name === '') return nameRef.current?.focus();

    const fields = { parentId: draft.parentId, name, icon: draft.icon, color: draft.color };
    const conflict = 'categories.error.parentArchived';
    if (category) {
      // Only real changes, so the audit log names them.
      const changes = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => category[key as keyof typeof fields] !== value,
        ),
      );
      if (Object.keys(changes).length === 0) return done();
      update.mutate(changes, { onSuccess: done, onError: (e) => onError(e, conflict) });
    } else {
      create.mutate(
        { ...fields, kind: draft.kind },
        { onSuccess: done, onError: (e) => onError(e, conflict) },
      );
    }
  }

  function toggleArchived() {
    if (!category) return;
    const archiving = !category.archived;
    const conflict = archiving
      ? 'categories.error.archiveChildrenFirst'
      : 'categories.error.parentArchived';
    // Say so before asking: the server would refuse it too.
    const refused = archiving
      ? children.some((c) => !c.archived)
      : all.some((c) => c.id === category.parentId && c.archived);
    if (refused) return setProblem(conflict);
    update.mutate(
      { archived: archiving },
      { onSuccess: done, onError: (e) => onError(e, conflict) },
    );
  }

  const listPath = draft.kind === 'INCOME' ? '/categories?kind=INCOME' : '/categories';
  function done() {
    void navigate(listPath);
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div className="flex items-center gap-3">
        <CategoryBadge icon={draft.icon} color={draft.color} />
        <h1 id={ids.title} className="me-auto text-2xl font-bold">
          {t(category ? 'categories.form.editTitle' : 'categories.form.newTitle')}
        </h1>
        <Link
          to={listPath}
          className="text-sm font-medium text-accent underline underline-offset-4"
        >
          {t('categories.back')}
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
            {t('categories.form.name')}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            value={draft.name}
            maxLength={100}
            onChange={(e) => change({ name: e.target.value })}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? ids.nameError : undefined}
            className={inputClass}
          />
          {nameError && (
            <p id={ids.nameError} className="text-sm text-danger">
              {t('categories.error.nameRequired')}
            </p>
          )}
        </div>
        {category ? (
          <p className="text-sm text-foreground-muted">
            <span className="font-medium text-foreground">
              {t('categories.kind')}: {t(CATEGORY_KIND_LABELS[category.kind])}
            </span>{' '}
            <span>{t('categories.form.kindFixed')}</span>
          </p>
        ) : (
          <ChoiceGroup<CategoryKind>
            legend={t('categories.kind')}
            choices={KIND_ORDER.map((value) => ({
              value,
              label: t(CATEGORY_KIND_LABELS[value]),
            }))}
            value={draft.kind}
            // Parents are of the same kind.
            onChange={(value) => change({ kind: value, parentId: null })}
          />
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.parent} className="font-medium">
            {t('categories.form.parent')}
          </label>
          <select
            id={ids.parent}
            value={draft.parentId ?? ''}
            disabled={children.length > 0}
            onChange={(e) => change({ parentId: e.target.value || null })}
            aria-describedby={ids.parentHint}
            className={inputClass}
          >
            <option value="">{t('categories.form.noParent')}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
          <p id={ids.parentHint} className="text-sm text-foreground-muted">
            {t(children.length > 0 ? 'categories.form.hasChildren' : 'categories.form.parentHint')}
          </p>
        </div>
        <IconPicker value={draft.icon} color={draft.color} onChange={(icon) => change({ icon })} />
        <ColorPicker value={draft.color} onChange={(color) => change({ color })} />
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
          {t(category ? 'categories.form.save' : 'categories.form.create')}
        </button>
      </form>
      {category && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <button
            type="button"
            disabled={update.isPending}
            onClick={toggleArchived}
            aria-describedby={ids.archiveHint}
            className="w-fit rounded-md border border-border px-4 py-2 font-medium disabled:opacity-60"
          >
            {t(category.archived ? 'categories.form.unarchive' : 'categories.form.archive')}
          </button>
          <p id={ids.archiveHint} className="text-sm text-foreground-muted">
            {t('categories.form.archiveHint')}
          </p>
        </div>
      )}
    </section>
  );
}
