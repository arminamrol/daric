import type { Locale } from '@daric/core';
import { en } from './en';
import { fa } from './fa';

export type MessageKey = keyof typeof fa;
export type Messages = Readonly<Record<MessageKey, string>>;

const DICTIONARIES: Readonly<Record<Locale, Partial<Messages>>> = { fa, en };

/** The `{param}` names in a message, e.g. `'path'` for `'… {path} …'`. */
type ParamNames<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | ParamNames<Rest>
  : never;

export type MessageParams<K extends MessageKey> = Readonly<
  Record<ParamNames<(typeof fa)[K]>, string>
>;

type ParamArgs<K extends MessageKey> = [ParamNames<(typeof fa)[K]>] extends [never]
  ? []
  : [params: MessageParams<K>];

/** Keys of messages without placeholders, for messages picked from data (menus, option lists). */
export type PlainMessageKey = {
  [K in MessageKey]: ParamArgs<K> extends [] ? K : never;
}[MessageKey];

export type Translate = <K extends MessageKey>(key: K, ...params: ParamArgs<K>) => string;

/** Returns `t`, which looks up messages for `locale`. */
export function createTranslator(locale: Locale): Translate {
  const messages = DICTIONARIES[locale];
  return (key, ...[params]) => {
    const message = messages[key] ?? fa[key];
    if (!params) return message;
    const values: Readonly<Record<string, string>> = params;
    return message.replace(
      /\{(\w+)\}/g,
      (placeholder, name: string) => values[name] ?? placeholder,
    );
  };
}
