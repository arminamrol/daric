import { describe, expect, it } from 'vitest';
import {
  categoryColors,
  categoryIcons,
  categoryTree,
  defaultCategories,
  swapWithNeighbour,
  type CategoryNode,
} from './categories';

const node = (id: string, fields: Partial<CategoryNode> = {}): CategoryNode => ({
  id,
  kind: 'EXPENSE',
  parentId: null,
  ...fields,
});

describe('categoryTree', () => {
  it('nests children under their parent, keeping the given order', () => {
    const food = node('food');
    const rent = node('rent');
    const groceries = node('groceries', { parentId: 'food' });
    const eatingOut = node('eating-out', { parentId: 'food' });
    expect(categoryTree([food, groceries, rent, eatingOut])).toEqual([
      { ...food, children: [groceries, eatingOut] },
      { ...rent, children: [] },
    ]);
  });

  it('drops children whose parent is not in the list', () => {
    expect(categoryTree([node('orphan', { parentId: 'archived-parent' })])).toEqual([]);
  });
});

describe('defaultCategories', () => {
  const all = defaultCategories.flatMap(({ children = [], ...parent }) => [parent, ...children]);

  it('cover both kinds, at most one level deep', () => {
    expect(new Set(defaultCategories.map((c) => c.kind))).toEqual(new Set(['INCOME', 'EXPENSE']));
    for (const parent of defaultCategories) {
      for (const child of parent.children ?? []) expect(child).not.toHaveProperty('children');
    }
  });

  it('use known icons and colors and distinct names within a kind', () => {
    for (const category of all) {
      expect(categoryIcons).toContain(category.icon);
      expect(categoryColors).toContain(category.color);
    }
    for (const kind of ['INCOME', 'EXPENSE'] as const) {
      const names = defaultCategories
        .filter((c) => c.kind === kind)
        .flatMap(({ name, children = [] }) => [name, ...children.map((c) => c.name)]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe('swapWithNeighbour', () => {
  const food = node('food');
  const hidden = node('hidden');
  const rent = node('rent');
  const bread = node('bread', { parentId: 'food' });
  const salary = node('salary', { kind: 'INCOME' });
  const all = [food, hidden, rent, bread, salary];

  it('swaps with the nearest shown sibling, keeping hidden ones in place', () => {
    const visible = [food, rent, bread, salary];
    expect(swapWithNeighbour(all, visible, rent, -1)).toEqual(['rent', 'hidden', 'food']);
    expect(swapWithNeighbour(all, visible, food, 1)).toEqual(['rent', 'hidden', 'food']);
  });

  it('answers null at either edge', () => {
    expect(swapWithNeighbour(all, all, food, -1)).toBeNull();
    expect(swapWithNeighbour(all, all, bread, 1)).toBeNull();
    expect(swapWithNeighbour(all, all, salary, 1)).toBeNull();
  });
});
