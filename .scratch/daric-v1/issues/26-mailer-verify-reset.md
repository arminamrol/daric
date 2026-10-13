# 26: Mailer, email verification and password reset

**What to build:** Users verify their email and can reset a forgotten password; emails go through a configurable SMTP mailer, captured by Mailpit in development.

**Blocked by:** 05, 06

**Status:** done

- [x] Mailer interface with SMTP adapter and a fake for tests
- [x] Email verification and password reset flows with single-use expiring tokens
- [x] fa email templates
- [x] Rate limits on these endpoints; HTTP tests with fake mailer

## Comments

Notes for later tickets:

- Mail: `MAILER` (`Mailer { send, close? }`) is provided globally by `MailerModule` as `SmtpMailer` (nodemailer; `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/`MAIL_FROM`). Send through `MailService.deliver(message)`: it never awaits and logs failures, so issue tokens inside the transaction and deliver after it commits. `startTestApp` always swaps in `FakeMailer` as `t.mail` (`sent`, `to`, `last`, `lastToken`, `fail`); no API test talks SMTP. Billing reminders (40/43) and Invitations (40.1) should reuse this.
- Templates are fa only, in `apps/api/src/modules/mailer/templates.ts` (`render()` gives text + RTL HTML in the light theme from `@daric/design-tokens`). 33 adds English; the User has no stored locale yet.
- Links point at `APP_URL` (web origin): `/verify-email?token=`, `/reset-password?token=`, `/forgot-password`. Mobile (30+) has no deep links for them; the web pages work on a phone browser.
- `email_tokens` (identity table, no `daric_app` grants): SHA-256 hash only, a purpose, the address it was mailed to (void once `users.email` differs, for a future email change), 24h for verification and 1h for reset. A new token voids the earlier unused ones of its purpose; at most `EMAIL_TOKENS_PER_HOUR` (3) per User and purpose. Rows are never pruned; add a cleanup with account deletion (40.2) or a job.
- `users.email_verified_at`; `GET /v1/me` returns `user.emailVerified`. Nothing is gated on it yet. A reset also counts as verifying.
- Endpoints: `POST /v1/auth/email/verify`, `/password/forgot` (always 202), `/password/reset` are in `AuthController` (login rate limit, CSRF for the web); `POST /v1/auth/email/verification` (resend, signed in; 409 once verified, 429 past the cap) is its own controller. Routes marked `@SendsMail()` also fall under the `mail` throttler (`MAIL_RATE_LIMIT_PER_HOUR`, per client).
- A reset revokes every refresh family of the User (all Signed-in Devices) and mails a "password changed" notice; access tokens already issued live out their 15 minutes, as with logout.
- `forgotPassword` does more DB work for a registered email than for an unknown one, so its timing differs slightly; registration's 409 already reveals registered emails.
- `VerifyEmailPage` verifies on load, so a mail scanner that runs JavaScript may use up the link (harmless: the address then counts as verified). The web pages drop `?token=` from the address bar once read (`useLinkToken`).
- `hashRefreshToken` is now `hashToken` (shared by refresh and email tokens).
