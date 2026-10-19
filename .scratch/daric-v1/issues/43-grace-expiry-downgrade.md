# 43: Reminders, Grace Period and downgrade

**What to build:** Users are emailed before their Subscription or Trial ends; after it ends they get a 7-day Grace Period with a banner; then extra Signed-in Devices are signed out and Members of their Workspaces are suspended, and resubscribing restores everything without any data loss.

**Blocked by:** 26, 40.1, 41, 42

**Status:** done

- [x] Scheduled job sends reminder emails 7 days and 1 day before expiry (fa templates)
- [x] Banner in web during the Grace Period with days left and a link to checkout
- [x] After the Grace Period only the most recently active Signed-in Device stays
- [x] Members of Workspaces the User owns are suspended, not removed; suspended Members see "access paused by the Owner's plan"; the Owner is warned before it happens
- [x] Resubscribing un-suspends Members immediately
- [x] No financial data is changed or deleted by expiry
- [x] Audit log entries for suspension and restoration
- [x] Tests with a controllable clock: reminders, grace boundary, downgrade, restore

## Comments

Notes for later tickets:

- `subscriptionView` now applies the Grace Period (`billing.graceDays`, 7): Plus Entitlements and `plan: 'PLUS'` last until `graceEndsAt` (expiry + 7 days); `inGracePeriod` is true between the expiry and then. `onTrial` is false in the Grace Period. Anything asking "is bought time still running" must check `!inGracePeriod` too (account deletion's `plusForfeitedUntil` does). Test helpers that put a User "on Free" (`makeFree`, device-limit's `putOnFree`) now set the expiry `GRACE_DAYS + 1` days back.
- `ExpiryService.runDue(now, only?)` (`modules/billing/expiry.service.ts`, in `ExpiryModule`, which imports `AuthModule`) is the job; `ExpiryJob` runs it at startup and every `EXPIRY_JOB_INTERVAL_MINUTES` (60; 0 off, tests use 0 and call `runDue` with their own clock and `{ userIds }`). `dueExpiryStep` (`expiry.ts`) picks the one step due: `REMINDER_7_DAYS` from expiry − 7d, `REMINDER_1_DAY` from expiry − 1d, `GRACE_STARTED` from the expiry, `DOWNGRADED` from the end of the Grace Period. A mail step missed while the job was down is skipped, not sent late; the downgrade is never skipped.
- `expiry_steps` (migration 0021, identity-like: no RLS, no grants) records each step once per `(user_id, expires_at, step)`; inserting it is the claim, so concurrent runs take a step once, and a renewal (new `expires_at`) starts them afresh. The step runs with the `subscriptions` row locked, like a Payment settling, so a payment and a downgrade never cross.
- Mails (fa/en, User's locale): `plusEndingTemplate` (7 days / tomorrow, Trial or bought) and `gracePeriodTemplate`; both link to `APP_URL/settings/subscription/checkout`. An Owner of a Workspace with other Members gets the warning that they will be suspended (in the reminders and the Grace Period mail). No mail on billing-disabled servers.
- Downgrade: `SignedInDevicesService.downgrade(tx, userId)` keeps the most recently used live devices up to the (now Free) device Entitlement and ends the rest with the new end reason `PLUS_ENDED` (in `signedOutReasons`, so the refresh 401 carries it; web login shows it with the Plus link), audited `auth.plus_ended { deviceIds }`. `enforceLimit` shares `keepMostRecent` with it. `SignedInDevicesService` is now exported by `AuthModule`.
- Suspension: `workspace_members.suspended_at`. `suspendMembersOf`/`restoreMembersOf` (`modules/billing/suspension.ts`) set/clear it for every non-Owner membership in the Workspaces a User owns, auditing `member.suspend` (actor null) / `member.restore` (actor the Owner when their payment did it, else null) per Member with `{ memberUserId, role }`. Nothing else changes: Role, Consent and data stay. `WorkspaceGuard` answers 403 `reason: MEMBERSHIP_SUSPENDED` (`MEMBERSHIP_SUSPENDED` in core), and `app_member_workspace_id()` ignores suspended memberships, so RLS shuts them out too. The Owner can still remove a suspended Member.
- Restoring: `PaymentsService.settle` restores in the Payment's transaction, so access returns with the redirect. Every job run also restores the Members of any Owner who may share again (`ownersWithSuspendedMembers`), which covers billing being turned off and any other way back to Plus. Suspension itself happens only at the `DOWNGRADED` step: an ownership transfer to a lapsed User does not suspend anyone until that User's own next downgrade.
- `/v1/me` workspaces are `myWorkspaceSchema` (`workspaceSchema` + `suspended`); `memberSchema` has `suspended`. Web: `RequireSession` shows `SuspendedWorkspace` ("access paused by the Owner's plan") for a suspended current Workspace, except on the User's own pages (subscription, consents, delete account); the switcher in the header still works. `GraceBanner` (shell) shows the days left (a part of a day counts as one) with a link to `CHECKOUT_PATH`; the Subscription page says until when Plus keeps working; the Members page marks "Paused" Members and tells the Owner renewing brings them back. Mobile shows none of this yet (44): a suspended Workspace answers 403 there.
