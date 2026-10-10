# 07: Refresh rotation, logout, mobile bearer

**What to build:** Sessions stay alive securely: refresh tokens rotate, a reused token revokes its whole family, logout ends the session, and mobile clients can authenticate with a bearer header.

**Blocked by:** 05

**Status:** done

- [x] Refresh endpoint rotates the token; the old one becomes invalid
- [x] Reusing a rotated token revokes the entire token family
- [x] Logout revokes the current family and clears cookies
- [x] API accepts `Authorization: Bearer` as well as cookies; refresh accepts a token in the body for mobile
- [x] Access token 15 min, refresh token 30 days (configurable)
- [x] HTTP tests cover rotation, reuse detection, expiry and logout

## Comments

Notes for later tickets:

- `POST /v1/auth/refresh` and `POST /v1/auth/logout` live in `SignedInDeviceController` (outside the login rate limit). Mobile (`X-Daric-Client: mobile`) sends `{ refreshToken }` in the body and gets `authResultSchema` back; the web app's refresh token comes only from its cookie and it gets `sessionSchema` plus new cookies. A request carrying `Authorization` is never judged by cookie here either, since it skips CSRF. Refresh does not rotate the CSRF cookie (other tabs still hold it); login and registration do.
- The refresh cookie's Path is now `/v1/auth` (was `/v1/auth/refresh`) so logout receives it; ADR-0006 is amended.
- `TokenService.rotate` locks the presented token row (`FOR UPDATE`). A token is usable once; presenting a used token revokes its whole family (audited as `auth.refresh_reuse`), even after it has expired. Each rotation gets a fresh `REFRESH_TOKEN_TTL_SECONDS`; there is no absolute cap on a family's life.
- There is no grace window: two tabs refreshing with the same cookie at once will look like reuse and end the Signed-in Device. The web client's refresh logic should run one refresh at a time (e.g. a shared promise plus a cross-tab lock such as `navigator.locks`).
- Logout revokes the refresh family only; an access token already issued stays valid until it expires (`ACCESS_TOKEN_TTL_SECONDS`, 15 min). Access tokens now carry a `jti`, so any two are distinct; nothing checks it yet.
- `@daric/api-client` has no `refresh`/`logout` yet, and the web app has no logout button or automatic refresh on 401; add them with the ticket that needs them.
