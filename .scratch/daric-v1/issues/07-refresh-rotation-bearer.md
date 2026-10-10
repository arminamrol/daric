# 07: Refresh rotation, logout, mobile bearer

**What to build:** Sessions stay alive securely: refresh tokens rotate, a reused token revokes its whole family, logout ends the session, and mobile clients can authenticate with a bearer header.

**Blocked by:** 05

**Status:** in-progress

- [ ] Refresh endpoint rotates the token; the old one becomes invalid
- [ ] Reusing a rotated token revokes the entire token family
- [ ] Logout revokes the current family and clears cookies
- [ ] API accepts `Authorization: Bearer` as well as cookies; refresh accepts a token in the body for mobile
- [ ] Access token 15 min, refresh token 30 days (configurable)
- [ ] HTTP tests cover rotation, reuse detection, expiry and logout
