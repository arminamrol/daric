import { ConflictException, NotFoundException } from '@nestjs/common';

export const ID_TAKEN = 'This id is already used';

/** What a create answered, and whether it made something (201) or found it made (200). */
export interface Created<T> {
  created: boolean;
  value: T;
}

/** `read`'s result, or undefined when it answers 404. */
export async function unlessMissing<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof NotFoundException) return undefined;
    throw error;
  }
}

/**
 * Creates something under the id the client chose, if it chose one (ADR-0005),
 * so a create sent again (an offline queue's replay) makes nothing new: it
 * answers with what the id holds now, changes made since included. `create`
 * validates, inserts ignoring a clash on the id, and answers undefined when
 * it inserted nothing. An id another Workspace holds answers 409, never its copy.
 */
export async function createOnce<T>(
  id: string | undefined,
  find: (id: string) => Promise<T | undefined>,
  create: () => Promise<T | undefined>,
): Promise<Created<T>> {
  if (id !== undefined) {
    const replayed = await find(id);
    if (replayed) return { created: false, value: replayed };
  }
  const made = await create();
  if (made) return { created: true, value: made };
  // The id was taken meanwhile: by a concurrent replay, or in another Workspace.
  const replayed = id === undefined ? undefined : await find(id);
  if (replayed) return { created: false, value: replayed };
  throw new ConflictException(ID_TAKEN);
}
