# 06: Web auth with httpOnly cookies

**What to build:** A person signs up or logs in from the Persian web app and lands on an empty home screen; tokens live only in server-set httpOnly cookies (ADR-0006).

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Sign-up and login pages in fa/RTL with accessible forms and validation messages
- [ ] Server sets access and refresh tokens as httpOnly, Secure, SameSite=Lax cookies; refresh cookie scoped to the refresh path
- [ ] Double-submit CSRF token required on mutating requests; HTTP tests prove rejection without it
- [ ] api-client sends credentials and the CSRF header; JS never reads a token
- [ ] Unauthenticated routes redirect to login; logged-in user sees an empty home
