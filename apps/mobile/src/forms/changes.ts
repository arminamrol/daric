/** The fields of `fields` that differ from `current`: an edit sends only real changes, so the audit log names them. */
export function changedFields<T extends object>(current: T, fields: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => current[key as keyof T] !== value),
  ) as Partial<T>;
}
