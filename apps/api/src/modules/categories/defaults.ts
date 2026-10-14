import { defaultCategories } from '@daric/core';
import type { Locale } from '@daric/core';
import { v7 as uuidv7 } from 'uuid';
import type { Executor } from '../../db/client';
import { categories } from '../../db/schema';

/** Gives a new Workspace core's default Categories, in their listed order, named in `locale`. */
export async function seedDefaultCategories(
  db: Executor,
  workspaceId: string,
  locale: Locale = 'fa',
): Promise<void> {
  const positions = { INCOME: 0, EXPENSE: 0 };
  const rows = defaultCategories.flatMap(({ children = [], ...parent }) => {
    const parentId = uuidv7();
    return [
      {
        ...parent,
        name: parent.name[locale],
        id: parentId,
        workspaceId,
        parentId: null,
        position: positions[parent.kind]++,
      },
      ...children.map((child, position) => ({
        ...child,
        name: child.name[locale],
        id: uuidv7(),
        workspaceId,
        kind: parent.kind,
        parentId,
        position,
      })),
    ];
  });
  await db.insert(categories).values(rows);
}
