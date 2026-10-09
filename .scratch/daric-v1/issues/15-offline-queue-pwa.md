# 15: Offline queue and offline web (PWA)

**What to build:** On a device the user approved as an Offline Device, the web app opens offline, shows cached data, accepts new Transactions and edits, and syncs them when back online (ADR-0005).

**Blocked by:** 14

**Status:** ready-for-agent

- [ ] offline-queue package with a storage-adapter interface, in-memory adapter for tests and IndexedDB adapter for web
- [ ] Replay on reconnect and app start, in order; creates are idempotent by id
- [ ] Version conflicts surface a keep-mine/keep-theirs choice; deletes win
- [ ] "Keep data on this device?" asked once per device at login (default no on web); TanStack Query cache persisted only when yes
- [ ] Logout wipes the queue and cached data
- [ ] Optimistic updates in the UI with pending indicators
- [ ] Unit tests at the offline-queue interface (fake transport) for duplicates, conflicts and ordering
