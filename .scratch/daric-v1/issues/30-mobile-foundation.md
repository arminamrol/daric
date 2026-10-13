# 30: Mobile foundation and fast entry

**What to build:** On the Expo app a user logs in, sees Transactions and records them with fast entry, in RTL Persian, online or offline.

**Blocked by:** 07, 15

**Status:** done

- [x] Expo Router app using api-client, core, i18n and design tokens
- [x] Bearer auth with tokens in SecureStore
- [x] RTL via I18nManager with correct reload handling; dark mode; accessibility labels
- [x] Offline Device opt-in (default yes) and SQLite/MMKV adapter for offline-queue; optimistic updates
- [x] Transaction list and fast entry screens

## Comments

Notes for later tickets:

- `@daric/api-client` takes `tokens: TokenStore` (`read`/`write`; `memoryTokenStore` for tests). With it, requests carry `Authorization: Bearer` and `X-Daric-Client: mobile` with no cookies or CSRF; login and sign-up keep the tokens they are handed and return the `Session` without them; a 401 refreshes once (one refresh at a time, since a refresh token is single-use) and repeats the request; a refused refresh (401) forgets the tokens; logout sends the refresh token in the body and forgets the tokens even when the API is unreachable. The web client is unchanged.
- `transactionTransport`, `withWaitingChanges`, `transactionFromInput`, `inputFromTransaction` and `QueuedTransactionChange` moved from `apps/web` into `@daric/api-client` (which now depends on `@daric/offline-queue`) so both apps share them. `indexedDbStorage` is now `keyValueStorage(store)` over any `KeyValueStore`.
- Mobile layout: `src/app` (Expo Router: `login`, `(app)/index` the Transactions of this Workspace-Calendar year by month, `(app)/new` fast entry as a modal), `src/offline` (`createOfflineDevice` with injected `store`/`settings`/`network`, `sqliteKeyValueStore` with a bigint-safe JSON codec, `connectionNetwork` over NetInfo), `src/storage` (`Settings`: small synchronous values in `expo-sqlite/kv-store`), `src/auth/tokens.ts` (SecureStore). Tests run in Node against these modules (SQLite through `node:sqlite`); screens have no component tests yet.
- "Keep data on this device?" is a switch on login, on by default (ADR-0005). The phone remembers whose data it holds (`daric.dataOwner`): a login by another User wipes what a lapsed session left before anything is kept. Logout wipes the queue, the kept cache, the answer and last picks; offline, the refresh token is put aside (`daric.logoutPending` in SecureStore) and the API is told at a later start.
- RTL: `applyDirection` sets I18nManager and reloads once (`reloadAppAsync`) when the direction must change, with a marker so a reload that did not take never loops; `app.json` also sets `forcesRTL` through `expo-localization`, so a native build starts RTL without reloading. Locale is fixed to `fa` until ticket 33.
- Theme follows `me.preferences.theme` once signed in, the phone's scheme before. Fonts: Vazirmatn 400 and 700 registered as `Vazirmatn` and `Vazirmatn-Bold` (`src/ui/fonts.ts`); `Text` picks the family by `bold`.
- Fast entry records Income and Expense only (amount first, done key records, last Account and per-type Category kept, day in the display calendar, note). Transfers, Labels, editing, deleting and conflict resolution on mobile are left for 31. The list shows Transfers recorded elsewhere.
- Not done: queued creates show only on top of a list that loaded once (online or from the kept cache); a phone that keeps no data opens offline to an error. `apps/mobile/src/offline/device.ts` mirrors `apps/web/src/offline/device.ts`; folding both into one shared module with platform adapters is a candidate follow-up.
- Native projects are generated (`ios/`, `android/` are git-ignored). Expo SDK 57 pins React 19.2.3 and React Native 0.86.3 for the mobile app while the web app stays on React 19.3.
