# 27: Invitations, Members and Consents

**What to build:** An Owner invites a partner or accountant by email or link with a role, can change or revoke it, and every Consent is recorded and revocable.

**Blocked by:** 26, 40

**Status:** ready-for-agent

- [ ] Invitations API: create (email + copyable link), accept (requires verified email), revoke, expire
- [ ] Members list, role change and removal following the role matrix in the plan
- [ ] user_consents table and API; `workspace_sharing` Consent recorded on accept; revocation takes effect immediately
- [ ] Audit log entries for invitations and role changes; audit viewer for Owner
- [ ] Web screens for members, invitations and consents
- [ ] HTTP tests for the role matrix
- [ ] Creating an Invitation requires the Owner's sharing Entitlement (Plus); a Free Owner sees the paywall instead (ADR-0008)
- [ ] Accepting needs no Plan; the Member's own device limit applies
