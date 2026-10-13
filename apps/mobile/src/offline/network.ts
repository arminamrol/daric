/** Whether the phone is online, and a way to hear when it comes back. */
export interface Network {
  isOnline(): boolean;
  /** Calls `onOnline` whenever the phone comes back online; returns the unsubscribe. */
  subscribe(onOnline: () => void): () => void;
}

/** What NetInfo reports about the connection. */
export interface ConnectionState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/** The slice of NetInfo the network uses. */
export interface Connection {
  addEventListener(listener: (state: ConnectionState) => void): () => void;
}

/**
 * The phone's network as NetInfo sees it. Unknown counts as online: a send
 * that fails just waits for the next try.
 */
export function connectionNetwork(connection: Connection): Network {
  let online = true;
  const listeners = new Set<() => void>();
  connection.addEventListener(({ isConnected, isInternetReachable }) => {
    const now = isConnected !== false && isInternetReachable !== false;
    const cameBack = now && !online;
    online = now;
    if (cameBack) for (const listener of listeners) listener();
  });
  return {
    isOnline: () => online,
    subscribe(onOnline) {
      listeners.add(onOnline);
      return () => void listeners.delete(onOnline);
    },
  };
}
