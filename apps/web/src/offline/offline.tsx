import type { QueuedTransactionChange } from '@daric/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useApi } from '../api/api';
import { createOfflineDevice } from './device';
import type { OfflineDevice } from './device';

const OfflineContext = createContext<OfflineDevice | null>(null);

/**
 * Sets up offline support. On an Offline Device the app waits for the kept
 * cache to be restored, so it opens with the data from the last visit.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [device] = useState(() => createOfflineDevice({ api, queryClient }));
  const [ready, setReady] = useState(() => !device.keeps());

  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    void device.restore().then(() => {
      if (!live) return;
      setReady(true);
      stop = device.start();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [device]);

  if (!ready) return null;
  return <OfflineContext value={device}>{children}</OfflineContext>;
}

export function useOfflineDevice(): OfflineDevice {
  const device = use(OfflineContext);
  if (!device) throw new Error('useOfflineDevice must be used inside <OfflineProvider>');
  return device;
}

/** The Transaction changes of a Workspace still waiting to reach the API, oldest first. */
export function useWaitingChanges(workspaceId: string): readonly QueuedTransactionChange[] {
  const { queue } = useOfflineDevice();
  const entries = useSyncExternalStore(queue.subscribe, queue.entries);
  return useMemo(() => entries.filter((e) => e.scope === workspaceId), [entries, workspaceId]);
}
