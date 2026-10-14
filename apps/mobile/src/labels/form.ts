import type { PlainMessageKey } from '@daric/i18n';

export interface LabelDraft {
  name: string;
  controllable: boolean;
}

/** The Label a draft describes, or what is wrong with its name. */
export function readLabelDraft(
  draft: LabelDraft,
): { ok: true; fields: LabelDraft } | { ok: false; errors: { name?: PlainMessageKey } } {
  const name = draft.name.trim();
  if (name === '') return { ok: false, errors: { name: 'labels.error.nameRequired' } };
  return { ok: true, fields: { name, controllable: draft.controllable } };
}
