# 41: Signed-in Device limit

**What to build:** A Free User who logs in on a second device is logged out of the least recently used one, which then explains why and links to Plus; Plus Users get the configured limit.

**Blocked by:** 07, 40

**Status:** ready-for-agent

- [ ] Each refresh-token family is a Signed-in Device with a last-used time and a readable name (browser/OS or phone model)
- [ ] Login beyond the device Entitlement revokes the least recently used family(ies); no login is ever blocked
- [ ] The revoked device's next refresh fails with a distinct reason; web shows "signed out because you signed in elsewhere" with an upgrade link
- [ ] Revocation wipes offline data on that device like a normal logout (ADR-0005)
- [ ] Subscription page lists Signed-in Devices and lets the User sign one out
- [ ] Unlimited when billing is disabled
- [ ] HTTP tests: Free second login revokes first, Plus within limit keeps both, reuse detection still works
