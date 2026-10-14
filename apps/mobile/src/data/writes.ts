import { entityKey } from '@daric/api-client';
import type { Entity, EntityWrite, WorkspaceWrite } from '@daric/api-client';
import type { Change } from '@daric/offline-queue';
import { useMutation } from '@tanstack/react-query';
import { getRandomBytes } from 'expo-crypto';
import { v7 as uuidv7 } from 'uuid';
import { useSignedIn } from '../auth/session';
import { useOfflineDevice } from '../offline/offline';

/** A new UUIDv7, so a create replayed from the queue is recognised by the API. */
export const newId = () => uuidv7({ random: getRandomBytes(16) });

/** A change of something in the signed-in User's Workspace; the Workspace is added on submit. */
export type WriteChange =
  Change<WorkspaceWrite> extends infer C
    ? C extends Change<WorkspaceWrite>
      ? Omit<C, 'scope'>
      : never
    : never;

export function created(id: string, write: EntityWrite): WriteChange {
  return { kind: 'create', entityId: entityKey(write.entity, id), payload: write };
}

/**
 * An edit naming only the fields it changes. Only Transactions carry versions
 * the API checks; anything else is last-write-wins, so its base version is 0.
 */
export function edited(id: string, write: EntityWrite): WriteChange {
  return { kind: 'update', entityId: entityKey(write.entity, id), payload: write, baseVersion: 0 };
}

export function deleted(entity: Entity, id: string): WriteChange {
  return { kind: 'delete', entityId: entityKey(entity, id) };
}

/** The API refused the change for good; it is dropped from the queue. */
export class ChangeRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ChangeRefused';
  }
}

/** Whether `error` is the API refusing a change with `status` (e.g. 409 for a name taken). */
export function refusedWith(error: unknown, status: number): boolean {
  return error instanceof ChangeRefused && error.reason === `API answered ${status}`;
}

/**
 * Sends a change through the offline queue: shown at once, and sent now or
 * once the phone is back online. When the API refuses it right away, it is
 * dropped and the mutation fails with `ChangeRefused`, so the screen can say
 * why; one refused later waits on the sync screen.
 */
export function useWrite() {
  const { queue } = useOfflineDevice();
  const { workspace } = useSignedIn();
  return useMutation({
    // The queue decides when it can send; the mutation must not wait for the network.
    networkMode: 'always',
    mutationFn: async (change: WriteChange): Promise<'synced' | 'queued'> => {
      const outcome = await queue.submit({
        ...change,
        scope: workspace.id,
      } as Change<WorkspaceWrite>);
      switch (outcome.status) {
        case 'synced':
        case 'queued':
          return outcome.status;
        case 'gone':
          // Deleted elsewhere meanwhile: deletes win, and there is nothing left to change.
          return 'synced';
        default:
          await queue.discard(workspace.id, change.entityId);
          throw new ChangeRefused(outcome.status === 'rejected' ? outcome.reason : outcome.status);
      }
    },
  });
}
