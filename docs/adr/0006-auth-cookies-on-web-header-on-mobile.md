# Auth tokens: httpOnly cookies on web, Authorization header on mobile

On web both access and refresh tokens are httpOnly, Secure, SameSite=Lax cookies set only by the server (refresh cookie path-scoped to `/v1/auth/refresh`), with a double-submit CSRF token on mutating requests; JS never sees a token. Mobile keeps the same tokens in SecureStore and sends `Authorization: Bearer`, because React Native's native cookie jars behave inconsistently across platforms. The API accepts both. Requires web app and API on the same site.
