/** How a bigint is written; Amounts are bigints and JSON has no such type. */
const BIGINT = '$bigint';

/** JSON text for `value`, bigints included. */
export function encode(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    typeof v === 'bigint' ? { [BIGINT]: v.toString() } : v,
  );
}

/** The value `encode` wrote. */
export function decode(text: string): unknown {
  return JSON.parse(text, (_, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      const digits = (v as Record<string, unknown>)[BIGINT];
      if (keys.length === 1 && typeof digits === 'string') return BigInt(digits);
    }
    return v;
  });
}
