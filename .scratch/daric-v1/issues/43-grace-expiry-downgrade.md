# 43: Reminders, Grace Period and downgrade

**What to build:** Users are emailed before their Subscription or Trial ends; after it ends they get a 7-day Grace Period with a banner; then extra Signed-in Devices are signed out and Members of their Workspaces are suspended, and resubscribing restores everything without any data loss.

**Blocked by:** 41, 42, 26, 27

**Status:** ready-for-agent

- [ ] Scheduled job sends reminder emails 7 days and 1 day before expiry (fa templates)
- [ ] Banner in web during the Grace Period with days left and a link to checkout
- [ ] After the Grace Period only the most recently active Signed-in Device stays
- [ ] Members of Workspaces the User owns are suspended, not removed; suspended Members see "access paused by the Owner's plan"; the Owner is warned before it happens
- [ ] Resubscribing un-suspends Members immediately
- [ ] No financial data is changed or deleted by expiry
- [ ] Audit log entries for suspension and restoration
- [ ] Tests with a controllable clock: reminders, grace boundary, downgrade, restore
