import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import config from './eslint.js';

async function messages(code: string, filePath = 'sample.ts') {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

async function lint(code: string, filePath?: string): Promise<string[]> {
  return (await messages(code, filePath)).map((m) => m.ruleId ?? m.message);
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

describe('logical properties', () => {
  /** The physical utilities reported in a TSX snippet. */
  async function physicalClasses(jsx: string): Promise<string[]> {
    const found = await messages(`export const C = () => ${jsx};\n`, 'sample.tsx');
    return found
      .filter((m) => m.ruleId === 'daric/logical-classes')
      .map((m) => /`([^`]+)`/.exec(m.message)?.[1] ?? m.message);
  }

  it('rejects left/right utilities in className', async () => {
    expect(
      await physicalClasses(
        '<div className="ml-2 mr-auto pl-4 pr-1 left-0 right-2 text-left text-right" />',
      ),
    ).toEqual(['ml-2', 'mr-auto', 'pl-4', 'pr-1', 'left-0', 'right-2', 'text-left', 'text-right']);
    expect(
      await physicalClasses(
        '<div className="border-l border-r-2 rounded-l-md rounded-tr float-left clear-right scroll-ml-4" />',
      ),
    ).toEqual([
      'border-l',
      'border-r-2',
      'rounded-l-md',
      'rounded-tr',
      'float-left',
      'clear-right',
      'scroll-ml-4',
    ]);
  });

  it('sees through variants, negatives, important marks, arbitrary values and expressions', async () => {
    expect(
      await physicalClasses(
        "<div className={cn('md:hover:ml-2', on && '-mr-1', `!pl-2 pr-[3px]! ${x}`, [x ? 'rtl:left-1' : 'end-0'])} />",
      ),
    ).toEqual(['md:hover:ml-2', '-mr-1', '!pl-2', 'pr-[3px]!', 'rtl:left-1']);
  });

  it('accepts logical and look-alike utilities', async () => {
    expect(
      await physicalClasses(
        '<div className="ms-2 me-auto ps-4 pe-1 start-0 end-2 text-start text-end border-s rounded-e-md rounded-ss float-start mx-auto inset-x-0 rounded-lg border-lime-500 leading-6 place-items-center prose [&>*]:ms-1" />',
      ),
    ).toEqual([]);
  });

  it('ignores strings outside className', async () => {
    expect(await physicalClasses("<div title='ml-2'>{'pr-4'}</div>")).toEqual([]);
  });

  it('rejects physical left/right properties in CSS but allows block-axis ones', async () => {
    expect(
      await lint(
        '.a { margin-left: 1rem; padding-right: 0; left: 0; text-align: right; }\n',
        'a.css',
      ),
    ).toEqual([
      'css/prefer-logical-properties',
      'css/prefer-logical-properties',
      'css/prefer-logical-properties',
      'css/prefer-logical-properties',
    ]);
    expect(
      await lint(
        '.a { margin-inline-start: 1rem; text-align: start; width: 100%; height: 100dvh; top: 0; }\n',
        'a.css',
      ),
    ).toEqual([]);
  });

  it('parses Tailwind directives in CSS', async () => {
    const css = [
      "@import 'tailwindcss';",
      '@theme { --color-gold-500: #c38f26; }',
      '@custom-variant dark (&:where(.dark, .dark *));',
      '@layer base { :focus-visible { outline: 2px solid var(--color-focus); } }',
      '',
    ].join('\n');
    expect(await lint(css, 'a.css')).toEqual([]);
  });
});
