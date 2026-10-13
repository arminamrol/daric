import { describe, expect, it } from 'vitest';
import { connectionNetwork } from './network';
import type { ConnectionState } from './network';

function fakeConnection() {
  let listener: ((state: ConnectionState) => void) | undefined;
  return {
    addEventListener(next: (state: ConnectionState) => void) {
      listener = next;
      return () => (listener = undefined);
    },
    emit: (state: ConnectionState) => listener?.(state),
  };
}

describe('connectionNetwork', () => {
  it('counts as online until told otherwise, so the first replay is tried', () => {
    expect(connectionNetwork(fakeConnection()).isOnline()).toBe(true);
  });

  it('is offline without a connection, or when the internet is known to be unreachable', () => {
    const connection = fakeConnection();
    const network = connectionNetwork(connection);
    connection.emit({ isConnected: false, isInternetReachable: null });
    expect(network.isOnline()).toBe(false);
    connection.emit({ isConnected: true, isInternetReachable: false });
    expect(network.isOnline()).toBe(false);
    connection.emit({ isConnected: true, isInternetReachable: null });
    expect(network.isOnline()).toBe(true);
  });

  it('tells subscribers when the phone comes back online, not on every report', () => {
    const connection = fakeConnection();
    const network = connectionNetwork(connection);
    let calls = 0;
    const stop = network.subscribe(() => calls++);
    connection.emit({ isConnected: true, isInternetReachable: true });
    connection.emit({ isConnected: false, isInternetReachable: false });
    connection.emit({ isConnected: true, isInternetReachable: true });
    connection.emit({ isConnected: true, isInternetReachable: true });
    expect(calls).toBe(1);
    stop();
    connection.emit({ isConnected: false, isInternetReachable: false });
    connection.emit({ isConnected: true, isInternetReachable: true });
    expect(calls).toBe(1);
  });
});
