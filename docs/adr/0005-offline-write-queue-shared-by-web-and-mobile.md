# One offline write queue for web (PWA) and mobile

Both clients must open and accept edits offline. The web is a PWA (service worker for the app shell) and both clients share `packages/offline-queue` with platform storage adapters (IndexedDB on web, SQLite/MMKV on mobile). Creates carry client-generated UUIDv7 ids so replays are idempotent; edits carry `version` and the server rejects stale ones (server wins, user picks keep-mine/keep-theirs); deletes win. The server stays the source of truth; this is not full sync, but keeps the path to it open.

Data is only kept on a device after the user agrees per device at login (default: off on web, on on mobile) and is wiped on logout, because a shared browser profile would otherwise expose financial data.
