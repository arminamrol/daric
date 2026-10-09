# 26: Mailer, email verification and password reset

**What to build:** Users verify their email and can reset a forgotten password; emails go through a configurable SMTP mailer, captured by Mailpit in development.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] Mailer interface with SMTP adapter and a fake for tests
- [ ] Email verification and password reset flows with single-use expiring tokens
- [ ] fa email templates
- [ ] Rate limits on these endpoints; HTTP tests with fake mailer
