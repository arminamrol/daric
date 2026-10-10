# 06: Web auth with httpOnly cookies

**What to build:** A person signs up or logs in from the Persian web app and lands on an empty home screen; tokens live only in server-set httpOnly cookies (ADR-0006).

**Blocked by:** 04, 05

**Status:** done

- [x] Sign-up and login pages in fa/RTL with accessible forms and validation messages
- [x] Server sets access and refresh tokens as httpOnly, Secure, SameSite=Lax cookies; refresh cookie scoped to the refresh path
- [x] Double-submit CSRF token required on mutating requests; HTTP tests prove rejection without it
- [x] api-client sends credentials and the CSRF header; JS never reads a token
- [x] Unauthenticated routes redirect to login; logged-in user sees an empty home

## Comments

Notes for later tickets:

- Transport is chosen per request: a request with `X-Daric-Client: mobile` gets tokens in the body and no cookies; anything else is a browser and gets `{ user, accessTokenExpiresAt, refreshTokenExpiresAt }` (`sessionSchema`) plus cookies. `authResultSchema` (with tokens) is the mobile shape. `CLIENT_HEADER`, `CSRF_COOKIE` and `CSRF_HEADER` are shared from `@daric/core`; the other cookie names, paths and helpers live in `apps/api/src/modules/auth/cookies.ts`: `__Host-daric_access` (Path=/), `__Secure-daric_refresh` (Path=`/v1/auth/refresh`), `__Host-daric_csrf` (readable by JS). 07's refresh and logout should reuse `setSessionCookies` and add a clearing helper.
- `AuthGuard` takes `Authorization: Bearer` first and falls back to the access cookie, except for requests with `X-Daric-Client: mobile`, which are never authenticated by cookie (they skip CSRF). A malformed bearer header is a 401, never replaced by the cookie. For 07: refresh must likewise never return a token read from a cookie in the body because the request claims to be mobile, or XSS could read it.
- `CsrfGuard` (global, after the throttler, before auth) requires `X-CSRF-Token` equal to the CSRF cookie on every non-GET/HEAD/OPTIONS request, including login and registration, unless the request carries `Authorization` or `X-Daric-Client: mobile`. `GET /v1/auth/csrf` (its own controller, so it does not count against the login rate limit) sets the cookie if missing; login and registration rotate it.
- The API tests' `call()` now acts as the mobile app (it sends `X-Daric-Client: mobile`); `browser()` in `src/test/app.ts` is a cookie jar that acts as the web app.
- The web app talks to the API on its own origin: Vite proxies `/v1` to `http://localhost:3000` in dev and preview, and the service worker skips `/v1/` navigations. Production must serve `/v1` from the web origin (one reverse proxy); `__Host-` cookies cannot be shared across subdomains.
- `@daric/api-client`: `createApiClient({ baseUrl?, fetch?, readCookie? })` with `register`, `login`, `me`; non-2xx answers throw `ApiError(status, body)`. Add endpoints there as tickets need them. The web app gets it through `ApiProvider`/`useApi()`; tests pass `fakeApi()` (in-memory) to `renderApp`, which defaults to a signed-in User.
- Web routing: `RequireSession` (home and future app pages) redirects to `/login` when `/v1/me` answers 401; `GuestOnly` wraps `/login` and `/signup` and sends signed-in Users home. The `['me']` query is the session state; after login it is dropped so it refetches. There is no logout button yet (07).
- Cookies are always `Secure`; Chrome and Firefox accept them on `http://localhost`, older Safari may not.
