# 41: Signed-in Device limit

**What to build:** A Free User who logs in on a second device is logged out of the least recently used one, which then explains why and links to Plus; Plus Users get the configured limit.

**Blocked by:** 07, 40

**Status:** in-progress

- [x] Each refresh-token family is a Signed-in Device with a last-used time and a readable name (browser/OS or phone model)
- [x] Login beyond the device Entitlement revokes the least recently used family(ies); no login is ever blocked
- [x] The revoked device's next refresh fails with a distinct reason; web shows "signed out because you signed in elsewhere" with an upgrade link
- [x] Revocation wipes offline data on that device like a normal logout (ADR-0005)
- [x] Subscription page lists Signed-in Devices and lets the User sign one out
- [x] Unlimited when billing is disabled
- [x] HTTP tests: Free second login revokes first, Plus within limit keeps both, reuse detection still works

## Comments

Notes for later tickets:

- `signed_in_devices` (migration 0019) is the Signed-in Device: its `id` is the refresh-token family id (`refresh_tokens.family_id` now references it, cascade), with `name`, `last_used_at` (login, then each refresh), `ended_at` and `end_reason` (`LOGOUT`, `REFRESH_REUSE`, `PASSWORD_RESET`, `DEVICE_LIMIT`, `SIGNED_OUT_REMOTELY`). Existing families were backfilled unnamed. It cascades from `users`, so the account-deletion scan stays clean. No RLS/grants, like the other identity tables.
- A device is *live* (counted and listed) while not ended and it still holds an unused, unrevoked, unexpired refresh token; a lapsed family needs no clean-up.
- `TokenService.issue(db, userId, { name })` creates the device; `endDevices(db, ids, reason)` and `revokeAllForUser(db, userId, reason)` revoke tokens and record why. Access tokens now carry `sid` (the device id); `AuthGuard` puts it on `req.user.deviceId` and `@CurrentDeviceId()` reads it (null for tokens minted before this ticket).
- `SignedInDevicesService.enforceLimit` runs in the login transaction after the new family is issued, with the User row locked (`FOR UPDATE`) so concurrent logins count each other. It keeps the newest `limit - 1` others by `last_used_at` and ends the rest as `DEVICE_LIMIT` (audited `auth.device_limit` with `{ deviceIds }`). Registration does not enforce (a new User has one device). `EntitlementsService.subscriptionOf/entitlementsOf` take an optional `Executor` as third argument. 43 ("only the most recently active Signed-in Device stays logged in" after Grace) can reuse `live`/`endDevices`, e.g. with a new end reason.
- `POST /v1/auth/refresh` 401 carries `reason` `DEVICE_LIMIT` or `SIGNED_OUT_REMOTELY` (`signedOutReasons` in core) only for those; logout, reuse, expiry and password reset stay reason-less. A refused web refresh clears the session cookies.
- `GET /v1/me/devices` (most recently used first, `current` flag) and `DELETE /v1/me/devices/:deviceId` (204; 404 if not the User's or already ended; audited `auth.device_sign_out`). The current device can technically be deleted too; the web hides that button (logout does it and wipes).
- Device names: `X-Daric-Device` header (`DEVICE_NAME_HEADER`) from native apps, else "Browser · OS" parsed from the user agent (`modules/auth/device-name.ts`), else null ("Unknown device" on screen). The mobile app sends `phoneName(Platform)`: maker + model on Android, only "iPhone"/"iPad" on iOS (no model without a native module such as `expo-device`).
- `@daric/api-client` now refreshes the web session too: a 401 on a non-anonymous request triggers one `POST /v1/auth/refresh` (shared promise, plus `navigator.locks` across tabs when available) and repeats the request. Sign-in and logout requests are anonymous and never refresh. `onSignedOut(reason)` is called when a refresh is refused (401) in either mode.
- Web: `reportSignedOut` (`auth/signedOut.ts`) stores the reason (`daric.signedOut`, localStorage, kept until the next sign-in) and `useForgetWhenSignedOut` (mounted in `AppProviders`) wipes the device like a logout; this now also happens when a session simply lapses. The login page shows the reason, with a link to `/settings/subscription` for `DEVICE_LIMIT`. `RequireSession` now passes `state.from` to `/login` and sign-in returns there (`useAfterSignIn`). Mobile wipes the same way (`useForgetWhenSignedOut` in the root layout) but shows no message yet (44).
