import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import config from './eslint.js';

async function lint(code: string): Promise<string[]> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath: 'sample.ts' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('shared ESLint preset', () => {
  it('accepts clean TypeScript', async () => {
    expect(await lint('export const add = (a: number, b: number): number => a + b;\n')).toEqual([]);
  });

  it('rejects explicit any', async () => {
    expect(await lint('export const x: any = 1;\n')).toContain(
      '@typescript-eslint/no-explicit-any',
    );
  });

  it('rejects loose equality', async () => {
    expect(await lint('export const same = (a: number, b: number) => a == b;\n')).toContain(
      'eqeqeq',
    );
  });

  it('requires type-only imports to use `import type`', async () => {
    expect(
      await lint("import { Foo } from './foo';\nexport const f = (x: Foo): Foo => x;\n"),
    ).toContain('@typescript-eslint/consistent-type-imports');
  });
});
