# 15: Offline queue and offline web (PWA)

**What to build:** On a device the user approved as an Offline Device, the web app opens offline, shows cached data, accepts new Transactions and edits, and syncs them when back online (ADR-0005).

**Blocked by:** 14

**Status:** done

- [x] offline-queue package with a storage-adapter interface, in-memory adapter for tests and IndexedDB adapter for web
- [x] Replay on reconnect and app start, in order; creates are idempotent by id
- [x] Version conflicts surface a keep-mine/keep-theirs choice; deletes win
- [x] "Keep data on this device?" asked once per device at login (default no on web); TanStack Query cache persisted only when yes
- [x] Logout wipes the queue and cached data
- [x] Optimistic updates in the UI with pending indicators
- [x] Unit tests at the offline-queue interface (fake transport) for duplicates, conflicts and ordering

## Comments

Notes for later tickets:

- `@daric/offline-queue` is generic over the payload `P` and server copy `S`: `createOfflineQueue({ storage, transport, isOnline })` with `submit(change)` (queue then replay; answers `synced` / `queued` / `conflict` / `gone` / `rejected`), `replay()` (single-flight, in order, stops at the first network failure), `resolve(scope, id, 'mine' | 'theirs')`, `discard(scope, id)`, `entries()`, `entriesFor(scope, id)`, `subscribe`, `clear()`. Storage adapters: `memoryStorage`, `indexedDbStorage(keyValueStore(name))`, `memoryKeyValueStore` for tests. Mobile (30) needs a SQLite/MMKV `QueueStorage` (read / write-all / clear) and a transport like `apps/web/src/offline/transport.ts`.
- Folding before send: an edit folds into a create never sent; edits fold into one that keeps the first base version; an edit made against a conflict's server version settles it, an older one stays held; a delete replaces what waits and cancels a create never sent. A create once sent (`attempted`) is never rewritten, since the server compares replayed creates field by field. A finished edit returns its new version and moves later edits of the same Transaction up to it.
- Web: Transaction writes (record, edit, delete) go through the queue; lists show waiting changes on top with a mark (`pending.ts`), and `SyncStatus` under the header offers keep theirs / keep mine and discard. Only Transactions are queued; other writes still need the network.
- "Keep data on this device?" is a checkbox on login and sign-up, unticked by default, remembered (`daric.keepData`) until logout, so it is asked at every login. Ticked, the queue and the TanStack Query cache (dehydrated, bigints by structured clone) live in IndexedDB `daric`; unticked, earlier kept data is deleted and the queue lives in memory only.
- Logout (header button) tries to send what waits, calls `POST /v1/auth/logout`, then wipes the queue, the kept cache, the answer and last picks. Offline the API cannot be told: `daric.logoutPending` makes the next visit log out first and start signed out; a login clears it. Unsent changes are wiped on logout without a warning.
- Also fixed: the header nav did not appear after login until a reload (the login form removed the `me` query the header was watching; it now resets it).
