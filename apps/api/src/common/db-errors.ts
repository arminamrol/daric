/** Whether `error` is Postgres refusing a duplicate, on `constraint` if given. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  const found = (cause ?? {}) as { code?: string; constraint?: string };
  return found.code === '23505' && (constraint === undefined || found.constraint === constraint);
}
